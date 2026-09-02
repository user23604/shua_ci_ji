const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

function makeContext() {
  const context = {
    console, URL, Date, Math, JSON, Promise, Error, TypeError, AbortController,
    setTimeout, clearTimeout,
    location: { href: 'https://user23604.github.io/shua_ci_ji/', origin: 'https://user23604.github.io' },
    document: {
      head: { appendChild() {} },
      createElement() { return { async: false, referrerPolicy: '', src: '', parentNode: null }; }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  load(context, 'assets/js/00-env.js');
  load(context, 'assets/js/01-utils-basic.js');
  load(context, 'assets/js/06-sync-runtime.js');
  load(context, 'assets/js/24-sync-remote-api.js');
  return context;
}

(async function() {
  {
    const context = makeContext();
    const calls = [];
    context.fetch = async (url, options) => {
      calls.push({ url: String(url), options: options || {} });
      return { ok: true, status: 200, json: async () => ({ id: 'gist', files: {} }) };
    };
    const result = await context.fetchGistMetadataWithCredentials({ gistId: 'abc', token: 'ghp_secret', allowJsonp: true });
    assert.strictEqual(result.readTransport, 'anonymous_fetch');
    assert.strictEqual(calls.length, 1);
    const headers = calls[0].options.headers || {};
    assert(!headers.Authorization && !headers.authorization, 'anonymous read unexpectedly sent PAT');
    assert(!headers['X-GitHub-Api-Version'], 'anonymous read added a non-simple header and would trigger CORS preflight');
  }

  {
    const context = makeContext();
    const calls = [];
    context.fetch = async (url, options) => {
      calls.push({ url: String(url), options: options || {} });
      if (calls.length === 1) return { ok: false, status: 404, headers: { get() { return ''; } }, text: async () => '' };
      return { ok: true, status: 200, json: async () => ({ id: 'private-gist', files: {} }) };
    };
    const result = await context.fetchGistMetadataWithCredentials({ gistId: 'private', token: 'ghp_secret', allowJsonp: true });
    assert.strictEqual(result.readTransport, 'authenticated_fetch');
    assert.strictEqual(calls.length, 2);
    const authHeaders = calls[1].options.headers || {};
    assert(authHeaders.Authorization, 'authenticated fallback omitted PAT');
    assert(!authHeaders['X-GitHub-Api-Version'], 'authenticated fallback added an undocumented browser CORS request header');
  }

  {
    const context = makeContext();
    context.fetch = async () => { throw new TypeError('Failed to fetch'); };
    context.document.head.appendChild = (script) => {
      script.parentNode = { removeChild() {} };
      const callback = new URL(script.src).searchParams.get('callback');
      assert(callback && typeof context[callback] === 'function', 'JSONP callback was not installed');
      setTimeout(() => context[callback]({ meta: { status: 200 }, data: { id: 'gist', files: {} } }), 0);
    };
    const result = await context.fetchGistMetadataWithCredentials({ gistId: 'abc', token: '', allowJsonp: true });
    assert.strictEqual(result.readTransport, 'jsonp');
    assert.strictEqual(result.authenticatedRead, false);
  }


  {
    const context = makeContext();
    const reset = Math.floor(Date.now() / 1000) + 120;
    const response = {
      status: 403,
      headers: { get(name) {
        const key = String(name).toLowerCase();
        if (key === 'x-ratelimit-remaining') return '0';
        if (key === 'x-ratelimit-reset') return String(reset);
        return '';
      } },
      text: async () => ''
    };
    const result = await context.classifyGithubResponseError(response, '读取 Gist');
    assert.strictEqual(result.rateLimited, true);
    assert(Date.parse(result.retryAt) >= reset * 1000 - 1000, 'rate-limit reset was not preserved');
  }

  console.log('Final network fallback tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
