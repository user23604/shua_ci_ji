"use strict";

// ── 云端备份 housekeeping 与 PATCH 写入收据 ─────────────────────────
// 职责拆分自 28-sync-push-patch.js：
// 1. 过期 sync.backup.* 的删除绝不混入关键业务 PATCH（见 buildGistPatchFiles），
//    只在业务写入确认成功后作为 best-effort 清理执行；
// 2. PATCH 2xx 响应本身作为写入收据（read-after-write 的第一手证据），
//    避免依赖可能命中 GitHub 边缘缓存的匿名读回。

function collectExpiredCloudBackupNames(fileNames) {
  var todayName = SYNC_CLOUD_BACKUP_PREFIX + localDateKey() + ".json";
  var backupNames = (Array.isArray(fileNames) ? fileNames : []).filter(function(name) {
    return String(name || "").startsWith(SYNC_CLOUD_BACKUP_PREFIX) && /\.json$/i.test(String(name));
  });
  if (!backupNames.includes(todayName)) backupNames.push(todayName);
  backupNames.sort().reverse();
  return backupNames.slice(Math.max(1, SYNC_CLOUD_BACKUP_RETENTION_DAYS));
}


async function cleanupExpiredCloudBackups(fileNames, runId) {
  const expiredNames = collectExpiredCloudBackupNames(fileNames);
  if (!expiredNames.length) return { ok: true, skipped: true };
  const files = {};
  expiredNames.forEach(function(name) { files[name] = null; });
  try {
    const response = await fetchWithTimeout(gistApiUrl(state.cloud.gistId), {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + state.cloud.token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ files: files })
    }, GITHUB_PATCH_TIMEOUT_MS, { stage: "gist_backup_cleanup", transport: "authenticated_fetch" });
    if (!response.ok) {
      const classified = await classifyGithubResponseError(response, "清理云端旧备份");
      appendAuditEvent({
        type: "sync:backup_cleanup_failed",
        message: "session=" + TAB_ID + " runId=" + (runId || "") + " status=" + Number(response.status || 0) +
          " names=" + expiredNames.join(",") +
          " detail=" + String(classified.technical || classified.message || "").slice(0, 300),
        httpStatus: Number(response.status || 0)
      });
      return { ok: false };
    }
    appendAuditEvent({
      type: "sync:backup_cleanup_ok",
      message: "session=" + TAB_ID + " runId=" + (runId || "") + " removed=" + expiredNames.length + " names=" + expiredNames.join(",")
    });
    return { ok: true, removed: expiredNames.length };
  } catch (error) {
    appendAuditEvent({
      type: "sync:backup_cleanup_failed",
      message: "session=" + TAB_ID + " runId=" + (runId || "") + " error=" + requestErrorTechnical(error).slice(0, 300)
    });
    return { ok: false };
  }
}


// 业务写入确认成功之后的 best-effort housekeeping：清理结果不允许反过来改变同步成败。
async function maybeCleanupExpiredCloudBackups(fileNames, runId) {
  if (!state.cloud || !state.cloud.gistId || !state.cloud.token) return { ok: true, skipped: true };
  try {
    return await cleanupExpiredCloudBackups(fileNames, runId);
  } catch (error) {
    appendAuditEvent({
      type: "sync:backup_cleanup_failed",
      message: "session=" + TAB_ID + " runId=" + (runId || "") + " error=" + requestErrorTechnical(error).slice(0, 300)
    });
    return { ok: false };
  }
}


// PATCH 的 2xx 响应本身就是本次写入的“收据”：响应体是写入完成后的 Gist 状态。
// 优先用它确认业务 hash，而不是立刻依赖一次新的匿名 GET——后者可能命中
// GitHub 边缘缓存（~60s s-maxage）返回写入前的旧内容，造成 verify 误判。
function extractGistReceiptFromPatchResponse(gist) {
  if (!gist || !isPlainObject(gist.files)) return null;
  const files = gist.files;
  const fileNames = Object.keys(files).filter(Boolean);
  const remoteVersion = (gist.history && gist.history[0] && gist.history[0].version) || "";
  const remoteUpdatedAt = gist.updated_at || "";
  const primary = files[SYNC_FILE_NAME];
  const truncated = Boolean(primary && primary.truncated);
  const candidates = [];
  if (primary) candidates.push(primary);
  sortedGistRecoveryCandidates(files).forEach(function(file) {
    if (!candidates.includes(file)) candidates.push(file);
  });
  for (var i = 0; i < candidates.length; i += 1) {
    var file = candidates[i];
    if (!file || typeof file.content !== "string" || !file.content.trim()) continue;
    var parsed = parseSyncPayloadContent(file.content);
    if (parsed.kind !== "valid_nonempty" && parsed.kind !== "valid_empty") continue;
    return {
      kind: parsed.kind,
      snapshot: parsed.snapshot || parsed.payload || null,
      payloadHash: parsed.payloadHash || "",
      fileNames,
      remoteVersion,
      remoteUpdatedAt,
      truncated
    };
  }
  return { kind: "unusable", snapshot: null, payloadHash: "", fileNames, remoteVersion, remoteUpdatedAt, truncated };
}
