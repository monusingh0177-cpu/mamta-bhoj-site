'use strict';
// Server-to-server forwarding of saved website enquiries to the DevMam sales CRM (POST /api/intake).
// Contract: devmam-b2b-syndication-engine/docs/WEBSITE_INTEGRATION_CONTRACT.md
//
// Safety rules:
//  - The CRM key lives only in server environment variables; it is sent only in the X-Intake-Key header
//    and never logged, rendered or returned to a browser.
//  - Forwarding is fire-and-forget: it can never fail, delay or alter the visitor's response or the email.
//  - Disabled (and silent) unless both CRM_INTAKE_URL and CRM_INTAKE_KEY are set and valid.
//  - Retries only transient failures (network error, timeout, 429, 5xx); never 400/401/other 4xx.
//  - The CRM de-duplicates identical enquiries for 24 h (200 duplicate_attached = success), so retries are safe.

const SOURCE = 'WEBSITE_FORM';
const MIN_KEY_LENGTH = 24;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BACKOFF_MS = [1000, 5000]; // 3 attempts in total
const MAX_PENDING = 50; // bounds memory if the CRM is down during a burst of enquiries
const PAGE_URL = 'https://devmamflourishfoods.com/contact';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

// Returns { enabled:false, reason } or { enabled:true, url, key, timeoutMs }. Never throws, never echoes the key.
function loadConfig(env) {
  const e = env || process.env;
  const rawUrl = String(e.CRM_INTAKE_URL || '').trim();
  const key = String(e.CRM_INTAKE_KEY || '').trim();
  if (!rawUrl && !key) return { enabled: false, reason: 'not_configured' };
  if (!rawUrl || !key) return { enabled: false, reason: 'incomplete_configuration' };
  let u;
  try { u = new URL(rawUrl); } catch (_) { return { enabled: false, reason: 'invalid_url' }; }
  if (u.username || u.password) return { enabled: false, reason: 'url_must_not_contain_credentials' };
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.has(u.hostname))) return { enabled: false, reason: 'url_must_be_https_or_loopback_http' };
  if (key.length < MIN_KEY_LENGTH || /[\s\u0000-\u001f\u007f]/.test(key) || /[^\x21-\x7e]/.test(key)) return { enabled: false, reason: 'invalid_key' };
  const t = Number(e.CRM_INTAKE_TIMEOUT_MS);
  return { enabled: true, url: u.toString(), key, timeoutMs: t >= 500 && t <= 30000 ? t : DEFAULT_TIMEOUT_MS };
}

// Maps a saved enquiry to the CRM's documented request body. Only documented fields are sent.
function buildPayload(enquiry) {
  const p = { source: SOURCE, page_url: PAGE_URL };
  const map = { name: 'name', phone: 'phone', type: 'type', productInterest: 'productInterest', monthlyRequirement: 'monthlyRequirement', cityState: 'cityState', message: 'message' };
  for (const k of Object.keys(map)) {
    const v = enquiry && enquiry[k];
    if (typeof v === 'string' && v) p[map[k]] = v;
  }
  return p;
}

// 'success' | 'retry' | 'permanent'
function classify(status) {
  if (status === 200 || status === 201) return 'success';
  if (status === 429 || status >= 500) return 'retry';
  return 'permanent'; // 400, 401, 403, 413, 415, other 4xx, unexpected 3xx/1xx
}

const sleepReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves with { ok, attempts, status?, reason } and never rejects. Logs status codes only.
async function forwardEnquiry(enquiry, opts) {
  const o = opts || {};
  const cfg = o.config || loadConfig(o.env);
  const log = o.log || console;
  const fetchFn = o.fetch || globalThis.fetch;
  const sleep = o.sleep || sleepReal;
  const backoff = o.backoffMs || DEFAULT_BACKOFF_MS;
  const id = enquiry && enquiry.id != null ? `#${enquiry.id}` : '(unsaved)';
  if (!cfg.enabled) return { ok: false, attempts: 0, reason: cfg.reason || 'disabled' };
  if (typeof fetchFn !== 'function') return { ok: false, attempts: 0, reason: 'fetch_unavailable' };

  const body = JSON.stringify(buildPayload(enquiry));
  const maxAttempts = backoff.length + 1;
  let last = { reason: 'unknown' };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let status = 0;
    let reason;
    try {
      const res = await fetchFn(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Intake-Key': cfg.key },
        body,
        redirect: 'error', // never follow a redirect carrying the key to another host
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      status = res.status;
      try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (_) { /* ignore */ }
      reason = `http_${status}`;
    } catch (err) {
      reason = err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout' : 'network_error';
    }
    const kind = status ? classify(status) : 'retry';
    last = { status: status || undefined, reason };
    if (kind === 'success') {
      log.log(`[crm] enquiry ${id} forwarded (HTTP ${status}, attempt ${attempt})`);
      return { ok: true, attempts: attempt, status, reason };
    }
    if (kind === 'permanent') {
      log.error(`[crm] enquiry ${id} NOT forwarded: ${reason}; not retrying${status === 401 ? ' (check CRM_INTAKE_KEY)' : ''}`);
      return { ok: false, attempts: attempt, status, reason };
    }
    if (attempt < maxAttempts) await sleep(backoff[attempt - 1]);
  }
  log.error(`[crm] enquiry ${id} NOT forwarded after ${maxAttempts} attempts: ${last.reason}; replay manually`);
  return { ok: false, attempts: maxAttempts, status: last.status, reason: last.reason };
}

let pending = 0;
// Fire-and-forget entry point used by the route. Always returns synchronously; never throws.
function forwardInBackground(enquiry, opts) {
  try {
    const o = opts || {};
    const cfg = o.config || loadConfig(o.env);
    if (!cfg.enabled) {
      if (cfg.reason !== 'not_configured') console.warn(`[crm] forwarding disabled: ${cfg.reason}`);
      return null;
    }
    if (pending >= MAX_PENDING) {
      console.error(`[crm] enquiry #${enquiry && enquiry.id} NOT forwarded: too many pending forwards; replay manually`);
      return null;
    }
    pending++;
    const p = forwardEnquiry(enquiry, Object.assign({}, o, { config: cfg }))
      .catch(() => ({ ok: false, attempts: 0, reason: 'unexpected' }))
      .finally(() => { pending--; });
    return p;
  } catch (_) {
    return null;
  }
}

module.exports = { SOURCE, loadConfig, buildPayload, classify, forwardEnquiry, forwardInBackground };
