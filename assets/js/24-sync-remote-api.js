"use strict";

function computeCurrentPayloadHash() {
  return businessPayloadHash(currentBusinessPayload());
}

// P0: 仅用于 audit/诊断，不得参与业务同步分支决策（Pull/Push/绿灯只看 sync.json 内容 hash）

function extractRemoteVersion(gist) {
  return (gist && gist.history && gist.history[0] && gist.history[0].version) || (gist && gist.updated_at) || "";
}


function classifyParsedPayloadSnapshot(snapshot, extra = {}) {
  const normalized = normalizeSyncPayload(snapshot || {});
  if (!validateSyncPayload(normalized)) return { kind: "invalid", reason: extra.reason || "payload validate failed", raw: extra.raw || null };
  const payloadHash = businessPayloadHash(normalized);
  return {
    kind: hasBusinessData(normalized) ? "valid_nonempty" : "valid_empty",
    schemaVersion: extra.schemaVersion || 1,
    snapshot: normalized,
    payload: normalized,
    payloadHash,
    ops: extra.ops || [],
    clients: extra.clients || {},
    rawV1: extra.rawV1,
    rawV2: extra.rawV2,
    payloadHashMismatch: extra.envelopeHash && extra.envelopeHash !== payloadHash,
    envelopePayloadHash: extra.envelopeHash || ""
  };
}


function parseSyncPayloadContent(content) {
  if (!String(content || "").trim()) return { kind: "empty", reason: "blank" };
  try {
    var payload = JSON.parse(content);
    if (!isPlainObject(payload) || !Object.keys(payload).length) return { kind: "empty", reason: "empty object" };

    if (payload.schemaVersion === 2) {
      if (!isPlainObject(payload.snapshot)) return { kind: "empty", reason: "v2 snapshot missing" };
      const ops = Array.isArray(payload.ops) ? payload.ops : [];
      if (ops.some(function(op) { return !isKnownV2Op(op); })) {
        return { kind: "v2_unknown_ops", reason: "v2 包含未知 ops，不能可靠 reduce", raw: payload, rawV2: payload };
      }
      let snapshot = normalizeSyncPayload(payload.snapshot || {});
      if (ops.length > 0) snapshot = reduceOps(snapshot, ops);
      return classifyParsedPayloadSnapshot(snapshot, {
        schemaVersion: 2,
        ops,
        clients: isPlainObject(payload.clients) ? payload.clients : {},
        rawV2: payload,
        raw: payload,
        reason: "v2 reduced"
      });
    }

    if (payload.version === 1 && isPlainObject(payload.payload)) {
      return classifyParsedPayloadSnapshot(payload.payload, {
        schemaVersion: 1,
        rawV1: payload,
        raw: payload,
        envelopeHash: typeof payload.payloadHash === "string" ? payload.payloadHash : ""
      });
    }

    if (payload.version === 1) {
      if (!isPlainObject(payload.settings) || !isPlainObject(payload.progress)) return { kind: "empty", reason: "legacy v1 no business fields" };
      return classifyParsedPayloadSnapshot(payload, { schemaVersion: 1, rawV1: payload, raw: payload });
    }

    return { kind: "invalid", reason: "unknown schema", raw: payload };
  } catch (error) {
    return { kind: "invalid", reason: error && error.message || "JSON parse failed" };
  }
}
// P0: 已废弃。P0 不使用 v2 ops 格式上传。

function wrapLegacyV1Payload() {
  throw new Error("wrapLegacyV1Payload 已废弃");
}


async function fetchGistSyncPayload() {
  const { gist, readOnlyAuthFallback, authStatus } = await fetchGistMetadata();
  // P0: remoteVersion 仅用于 audit/诊断，不得参与业务同步决策。空值不阻断同步。
  var remoteVersion = (gist.history && gist.history[0] && gist.history[0].version) || "";
  const remoteUpdatedAt = gist.updated_at || "";
  const files = gist.files || {};
  const primary = files[SYNC_FILE_NAME];
  if (primary) {
    const content = await readGistFileContent(primary, { unauthenticated: readOnlyAuthFallback });
    return {
      ...parseSyncPayloadContent(content),
      rawContent: content,
      remoteVersion,
      remoteUpdatedAt,
      fileName: SYNC_FILE_NAME,
      readOnlyAuthFallback,
      authStatus
    };
  }

  // Compatibility fallback: some older/manual Gists may store the same payload under
  // another .json filename. Read a valid version:1 payload instead of treating the
  // Gist as empty and creating a new blank sync.json.
  const candidates = Object.values(files)
    .filter((file) => file && file.filename !== SYNC_BACKUP_FILE_NAME && /\.json$/i.test(file.filename || ""));
  for (const file of candidates) {
    const content = await readGistFileContent(file, { unauthenticated: readOnlyAuthFallback });
    const parsed = parseSyncPayloadContent(content);
    if (isRemoteValidKind(parsed.kind)) {
      return {
        ...parsed,
        rawContent: content,
        remoteVersion,
        remoteUpdatedAt,
        fileName: file.filename || "",
        readOnlyAuthFallback,
        authStatus
      };
    }
  }
  return { kind: "missing", rawContent: "", remoteVersion, remoteUpdatedAt, fileName: "", readOnlyAuthFallback, authStatus, reason: "sync.json missing" };
}


async function fetchGistMetadata() {
  const url = `https://api.github.com/gists/${encodeURIComponent(state.cloud.gistId)}`;
  const authResponse = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${state.cloud.token}`,
      Accept: "application/vnd.github+json"
    }
  }, GITHUB_GET_TIMEOUT_MS);
  if (authResponse.ok) {
    return { gist: await authResponse.json(), readOnlyAuthFallback: false, authStatus: authResponse.status };
  }

  // If the token is invalid but the Gist is public, still read it without the
  // Authorization header so existing cloud data can restore the UI. Writes will
  // still be blocked until the user enters a valid PAT.
  if (authResponse.status === 401 || authResponse.status === 403) {
    const publicResponse = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    }, GITHUB_GET_TIMEOUT_MS);
    if (publicResponse.ok) {
      return { gist: await publicResponse.json(), readOnlyAuthFallback: true, authStatus: authResponse.status };
    }
  }

  throw new Error(`云端拉取失败：${authResponse.status}`);
}


async function readGistFileContent(file, { unauthenticated = false } = {}) {
  if (!file.truncated && typeof file.content === "string") return file.content;
  if (!file.raw_url) return "";
  const headers = {
    Accept: "application/vnd.github.raw"
  };
  if (!unauthenticated) headers.Authorization = `Bearer ${state.cloud.token}`;
  const response = await fetchWithTimeout(file.raw_url, { headers: headers }, 12000);
  if (!response.ok) throw new Error(`云端文件读取失败：${response.status}`);
  return response.text();
}


function isRemoteValidKind(kind) {
  return kind === "valid_nonempty" || kind === "valid_empty";
}


function isRemoteEmptyKind(kind) {
  return kind === "missing" || kind === "empty" || kind === "valid_empty";
}


function currentRemoteHash(remote) {
  return remote && isRemoteValidKind(remote.kind) && remote.snapshot ? businessPayloadHash(remote.snapshot) : "";
}


function currentRemotePayload(remote) {
  return remote && isRemoteValidKind(remote.kind) && remote.snapshot ? normalizeSyncPayload(remote.snapshot) : null;
}


async function classifyGithubResponseError(response, action) {
  let body = "";
  try { body = await response.text(); } catch (_) {}
  const status = response.status;
  const remaining = response.headers && response.headers.get ? response.headers.get("X-RateLimit-Remaining") : "";
  const reset = response.headers && response.headers.get ? response.headers.get("X-RateLimit-Reset") : "";
  let message = (action || "GitHub 请求") + "失败：HTTP " + status;
  if (status === 401) message = "GitHub PAT 无效或已过期，请重新生成带 Gist 权限的 PAT。";
  else if (status === 403 && remaining === "0") message = "GitHub API 限流，请等待到 " + (reset ? new Date(Number(reset) * 1000).toISOString() : "reset 时间") + " 后重试。";
  else if (status === 403) message = "GitHub API 拒绝访问，可能是 PAT 权限不足、scope 不含 Gist，或触发限流。";
  else if (status === 404) message = "没有找到这个 Gist，或当前 token 无权访问 private gist。";
  else if (status === 409 || status === 422) message = "GitHub 拒绝 PATCH 内容或请求格式，请导出诊断联系处理。";
  else if (status >= 500) message = "GitHub 服务端异常，请稍后重试。";
  return { message, technical: body ? body.slice(0, 1200) : "HTTP " + status };
}

function syncErrorMessage(error) {
  const raw = error?.message || "云同步失败";
  if (/401/.test(raw)) return "云同步失败：GitHub PAT 无效、已过期，或粘贴的不是完整 token。请重新生成带 Gist 写入权限的 PAT。";
  if (/403/.test(raw)) return "云同步失败：GitHub API 拒绝访问，可能是 PAT 没有 Gist 写入权限、频率限制，或短时间内多次使用无效 token 被临时限制。";
  if (/404/.test(raw)) return "云同步失败：没有找到这个 Gist。请检查 Gist ID 是否正确，以及 Token 是否能访问它。";
  return raw;
}


