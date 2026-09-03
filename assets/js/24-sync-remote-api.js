"use strict";

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

    if ((payload.version === 1 || payload.version === 2) && isPlainObject(payload.payload)) {
      return classifyParsedPayloadSnapshot(payload.payload, {
        schemaVersion: payload.version,
        rawV1: payload.version === 1 ? payload : undefined,
        rawV2: payload.version === 2 ? payload : undefined,
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
function gistApiUrl(gistId) {
  return "https://api.github.com/gists/" + encodeURIComponent(String(gistId || "").trim());
}

function githubHttpError(response, action, details = {}) {
  return createSyncRequestError((action || "GitHub 请求") + "失败：HTTP " + Number(response && response.status || 0), {
    kind: "http",
    stage: details.stage || "github",
    method: details.method || "GET",
    transport: details.transport || "fetch",
    httpStatus: Number(response && response.status || 0),
    urlHost: "api.github.com",
    rateLimited: details.rateLimited === true,
    retryAt: details.retryAt || ""
  });
}

async function fetchGistMetadataWithCredentials(options = {}) {
  const gistId = String(options.gistId || "").trim();
  const token = String(options.token || "").trim();
  const allowJsonp = options.allowJsonp !== false;
  const forceAuthenticated = options.forceAuthenticated === true && Boolean(token);
  const url = gistApiUrl(gistId);
  let anonymousResponse = null;
  let anonymousError = null;

  if (forceAuthenticated) {
    // 写后确认（read-after-write）必须携带 PAT 读取：匿名 GET 会命中 GitHub 边缘缓存
    // （api.github.com 对 GET 响应带 ~60s 的 s-maxage），可能返回写入前的旧内容，
    // 把一次成功的写入误判成“远端并发变化”。网络失败也不降级到匿名读；
    // 仅 PAT 失效/只读（401/403）时回退到下方匿名路径，保持既有只读兼容。
    let authFirstResponse = null;
    try {
      authFirstResponse = await fetchWithTimeout(url, {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json"
        }
      }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_authenticated", transport: "authenticated_fetch" });
    } catch (authFirstError) {
      throw authFirstError;
    }
    if (authFirstResponse.ok) {
      return {
        gist: await authFirstResponse.json(),
        readOnlyAuthFallback: false,
        authenticatedRead: true,
        authStatus: authFirstResponse.status,
        readTransport: "authenticated_fetch"
      };
    }
    if (authFirstResponse.status !== 401 && authFirstResponse.status !== 403) {
      const authFirstClassified = await classifyGithubResponseError(authFirstResponse, "读取 Gist");
      const authFirstError = githubHttpError(authFirstResponse, "读取 Gist", {
        stage: "gist_metadata_authenticated",
        method: "GET",
        transport: "authenticated_fetch",
        rateLimited: authFirstClassified.rateLimited,
        retryAt: authFirstClassified.retryAt
      });
      authFirstError.message = authFirstClassified.message;
      authFirstError.technical = authFirstClassified.technical;
      throw authFirstError;
    }
  }

  try {
    anonymousResponse = await fetchWithTimeout(url, {
      headers: { Accept: "application/vnd.github+json" }
    }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_anonymous", transport: "anonymous_fetch" });
  } catch (error) {
    anonymousError = error;
  }

  if (anonymousResponse && anonymousResponse.ok) {
    return {
      gist: await anonymousResponse.json(),
      readOnlyAuthFallback: false,
      authenticatedRead: false,
      authStatus: 0,
      readTransport: "anonymous_fetch"
    };
  }

  if (anonymousError && allowJsonp && isFetchNetworkFailure(anonymousError)) {
    try {
      const wrapped = await fetchJsonp(url, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_jsonp" });
      const status = Number(wrapped && wrapped.meta && wrapped.meta.status || 0);
      if (status >= 200 && status < 300 && wrapped && wrapped.data) {
        return {
          gist: wrapped.data,
          readOnlyAuthFallback: false,
          authenticatedRead: false,
          authStatus: 0,
          readTransport: "jsonp"
        };
      }
      if (status && status !== 403 && status !== 404) {
        throw createSyncRequestError("GitHub JSONP 读取失败：HTTP " + status, {
          kind: "http",
          stage: "gist_metadata_jsonp",
          method: "GET",
          transport: "jsonp",
          httpStatus: status,
          urlHost: "api.github.com"
        });
      }
    } catch (jsonpError) {
      anonymousError.jsonpError = requestErrorTechnical(jsonpError);
    }
  }

  const anonymousStatus = Number(anonymousResponse && anonymousResponse.status || 0);
  const shouldTryAuthenticated = Boolean(token) && (
    anonymousError || anonymousStatus === 401 || anonymousStatus === 403 || anonymousStatus === 404
  );

  if (shouldTryAuthenticated) {
    let authResponse;
    try {
      authResponse = await fetchWithTimeout(url, {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json"
        }
      }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_authenticated", transport: "authenticated_fetch" });
    } catch (authError) {
      if (anonymousError) authError.anonymousError = requestErrorTechnical(anonymousError);
      throw authError;
    }
    if (authResponse.ok) {
      return {
        gist: await authResponse.json(),
        readOnlyAuthFallback: false,
        authenticatedRead: true,
        authStatus: authResponse.status,
        readTransport: "authenticated_fetch"
      };
    }
    const classified = await classifyGithubResponseError(authResponse, "读取 Gist");
    const error = githubHttpError(authResponse, "读取 Gist", {
      stage: "gist_metadata_authenticated",
      method: "GET",
      transport: "authenticated_fetch",
      rateLimited: classified.rateLimited,
      retryAt: classified.retryAt
    });
    error.message = classified.message;
    error.technical = classified.technical;
    throw error;
  }

  if (anonymousResponse) {
    const classified = await classifyGithubResponseError(anonymousResponse, "读取 Gist");
    const error = githubHttpError(anonymousResponse, "读取 Gist", {
      stage: "gist_metadata_anonymous",
      method: "GET",
      transport: "anonymous_fetch",
      rateLimited: classified.rateLimited,
      retryAt: classified.retryAt
    });
    error.message = classified.message;
    error.technical = classified.technical;
    throw error;
  }

  throw anonymousError || createSyncRequestError("无法访问 GitHub Gist", {
    kind: "network",
    stage: "gist_metadata_anonymous",
    method: "GET",
    transport: "anonymous_fetch",
    urlHost: "api.github.com"
  });
}

function sortedGistRecoveryCandidates(files) {
  return Object.values(files || {})
    .filter(function(file) {
      return file && file.filename !== SYNC_BACKUP_FILE_NAME && /\.json$/i.test(file.filename || "");
    })
    .sort(function(a, b) {
      var an = String(a && a.filename || "");
      var bn = String(b && b.filename || "");
      var aDaily = an.startsWith(SYNC_CLOUD_BACKUP_PREFIX);
      var bDaily = bn.startsWith(SYNC_CLOUD_BACKUP_PREFIX);
      if (aDaily !== bDaily) return aDaily ? -1 : 1;
      return bn.localeCompare(an);
    });
}

async function fetchGistSyncPayload(options = {}) {
  const metadataResult = await fetchGistMetadata({ forceAuthenticated: options.forceAuthenticated === true });
  const { gist, readOnlyAuthFallback, authStatus, authenticatedRead, readTransport } = metadataResult;
  var remoteVersion = (gist.history && gist.history[0] && gist.history[0].version) || "";
  const remoteUpdatedAt = gist.updated_at || "";
  const files = gist.files || {};
  const fileNames = Object.keys(files);
  const primary = files[SYNC_FILE_NAME];
  if (primary) {
    const content = await readGistFileContent(primary, { preferAnonymous: true });
    return {
      ...parseSyncPayloadContent(content),
      rawContent: content,
      remoteVersion,
      remoteUpdatedAt,
      fileName: SYNC_FILE_NAME,
      fileNames,
      readOnlyAuthFallback,
      authenticatedRead,
      authStatus,
      readTransport
    };
  }

  const candidates = sortedGistRecoveryCandidates(files);
  for (const file of candidates) {
    const content = await readGistFileContent(file, { preferAnonymous: true });
    const parsed = parseSyncPayloadContent(content);
    if (isRemoteValidKind(parsed.kind)) {
      return {
        ...parsed,
        rawContent: content,
        remoteVersion,
        remoteUpdatedAt,
        fileName: file.filename || "",
        fileNames,
        readOnlyAuthFallback,
        authenticatedRead,
        authStatus,
        readTransport
      };
    }
  }
  return {
    kind: "missing",
    rawContent: "",
    remoteVersion,
    remoteUpdatedAt,
    fileName: "",
    fileNames,
    readOnlyAuthFallback,
    authenticatedRead,
    authStatus,
    readTransport,
    reason: "sync.json missing"
  };
}

async function fetchGistMetadata(options = {}) {
  return fetchGistMetadataWithCredentials({
    gistId: state.cloud.gistId,
    token: state.cloud.token,
    allowJsonp: true,
    forceAuthenticated: options.forceAuthenticated === true
  });
}

async function readGistFileContent(file, options = {}) {
  if (!file.truncated && typeof file.content === "string") return file.content;
  if (!file.raw_url) return "";

  let anonymousResponse = null;
  let anonymousError = null;
  try {
    anonymousResponse = await fetchWithTimeout(file.raw_url, {
      headers: { Accept: "application/vnd.github.raw" }
    }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_raw_anonymous", transport: "anonymous_fetch" });
  } catch (error) {
    anonymousError = error;
  }
  if (anonymousResponse && anonymousResponse.ok) return anonymousResponse.text();

  const status = Number(anonymousResponse && anonymousResponse.status || 0);
  if (state.cloud.token && (anonymousError || status === 401 || status === 403 || status === 404)) {
    const authResponse = await fetchWithTimeout(file.raw_url, {
      headers: {
        Authorization: "Bearer " + state.cloud.token,
        Accept: "application/vnd.github.raw"
      }
    }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_raw_authenticated", transport: "authenticated_fetch" });
    if (authResponse.ok) return authResponse.text();
    const classified = await classifyGithubResponseError(authResponse, "读取 Gist 文件");
    const error = githubHttpError(authResponse, "读取 Gist 文件", {
      stage: "gist_raw_authenticated",
      method: "GET",
      transport: "authenticated_fetch",
      rateLimited: classified.rateLimited,
      retryAt: classified.retryAt
    });
    error.message = classified.message;
    error.technical = classified.technical;
    throw error;
  }
  if (anonymousResponse) {
    throw githubHttpError(anonymousResponse, "读取 Gist 文件", {
      stage: "gist_raw_anonymous",
      method: "GET",
      transport: "anonymous_fetch"
    });
  }
  throw anonymousError || createSyncRequestError("云端文件读取失败", {
    kind: "network",
    stage: "gist_raw_anonymous",
    method: "GET",
    transport: "anonymous_fetch",
    urlHost: "gist.githubusercontent.com"
  });
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
  if (!remote) return null;
  if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") return null;
  if (remote.payload && isPlainObject(remote.payload)) return normalizeSyncPayload(remote.payload);
  if (remote.snapshot && isPlainObject(remote.snapshot)) return normalizeSyncPayload(remote.snapshot);
  if (remote.parsed && remote.parsed.payload && isPlainObject(remote.parsed.payload)) return normalizeSyncPayload(remote.parsed.payload);
  if (remote.parsed && remote.parsed.snapshot && isPlainObject(remote.parsed.snapshot)) return normalizeSyncPayload(remote.parsed.snapshot);
  return null;
}


function remoteHasBusinessPayload(remote) {
  const payload = currentRemotePayload(remote);
  return Boolean(payload && hasBusinessData(payload));
}


function remoteIsEmptyPayload(remote) {
  if (!remote) return true;
  if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") return false;
  if (remote.kind === "missing" || remote.kind === "empty" || remote.kind === "valid_empty") return true;
  const payload = currentRemotePayload(remote);
  if (!payload) return false;
  return !hasBusinessData(payload);
}


function githubRetryAtFromResponse(response) {
  if (!response || !response.headers || typeof response.headers.get !== "function") return "";
  var now = Date.now();
  var candidates = [];
  var retryAfter = String(response.headers.get("Retry-After") || "").trim();
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter)) candidates.push(now + Number(retryAfter) * 1000);
    else {
      var retryDate = Date.parse(retryAfter);
      if (Number.isFinite(retryDate)) candidates.push(retryDate);
    }
  }
  var reset = Number(response.headers.get("X-RateLimit-Reset") || 0);
  if (Number.isFinite(reset) && reset > 0) candidates.push(reset * 1000);
  var future = candidates.filter(function(value) { return Number.isFinite(value) && value > now; });
  if (!future.length) return "";
  return beijingISOString(new Date(Math.max.apply(Math, future)));
}


async function classifyGithubResponseError(response, action) {
  let body = "";
  try { body = await response.text(); } catch (_) {}
  const status = response.status;
  const remaining = response.headers && response.headers.get ? response.headers.get("X-RateLimit-Remaining") : "";
  const reset = response.headers && response.headers.get ? response.headers.get("X-RateLimit-Reset") : "";
  let message = (action || "GitHub 请求") + "失败：HTTP " + status;
  if (status === 401) message = "GitHub PAT 无效或已过期，请重新生成带 Gist 权限的 PAT。";
  else if (status === 403 && remaining === "0") message = "GitHub API 限流，请等待到 " + (reset ? beijingISOString(new Date(Number(reset) * 1000)) : "reset 时间") + " 后重试。";
  else if (status === 403) message = "GitHub API 拒绝访问，可能是 PAT 权限不足、scope 不含 Gist，或触发限流。";
  else if (status === 404) message = "没有找到这个 Gist，或当前 token 无权访问 private gist。";
  else if (status === 409) message = "GitHub Gist 并发更新冲突，即将自动重试。";
  else if (status === 422) message = "GitHub 拒绝 PATCH 内容或请求格式，请导出诊断联系处理。";
  else if (status >= 500) message = "GitHub 服务端异常，请稍后重试。";
  var rateLimited = status === 429 || remaining === "0" || Boolean(response.headers && response.headers.get && response.headers.get("Retry-After"));
  return {
    message,
    technical: body ? body.slice(0, 1200) : "HTTP " + status,
    rateLimited,
    retryAt: rateLimited ? githubRetryAtFromResponse(response) : ""
  };
}

function syncErrorMessage(error) {
  const normalized = normalizeSyncRequestError(error);
  if (normalized.kind === "timeout") return "连接 GitHub 超时，本地数据已保存，稍后会自动重试。";
  if (normalized.kind === "network") return "当前无法完成 GitHub Gist 网络请求，本地数据已保存，稍后会自动重试。";
  if (normalized.httpStatus === 401) return "GitHub PAT 无效或已过期，请重新生成带 Gist 写入权限的 PAT。";
  if (normalized.httpStatus === 403) return "GitHub 拒绝访问：可能是 PAT 权限不足或 API 限流。";
  if (normalized.httpStatus === 404) return "没有找到这个 Gist，或当前 PAT 无权访问它。";
  return normalized.message || "云同步失败";
}


