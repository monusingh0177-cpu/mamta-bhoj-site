'use strict';
// Optional Semrush market data for the target keywords (AUTOPILOT_SEMRUSH_API_KEY). It supplies ESTIMATED monthly search
// volume for a keyword in one country database; it is never used as a ranking, an impression count or evidence of
// anything on our own site. Like Search Console, the states are kept apart:
//   not_configured - no API key: nothing was asked
//   ok             - the API answered; each keyword is "data" (a number) or "no_data" (Semrush has nothing for it: a real zero/absence)
//   no_units       - the account has no API units left (or the request quota is used): NOT a zero, nothing was measured
//   auth_invalid   - wrong key or API access disabled
//   rate_limited / network / api_error - temporary or unknown failures
// The response format and the error codes below follow Semrush's documented "ERROR nn :: text" convention; this build
// could not be verified against a live Semrush account (see docs/seo-autopilot.md), so it is covered by fixtures only.
const fs = require('fs');
const path = require('path');
const { requestRetry, readJson, writeJson, ensureDir, sha1, redact } = require('./util');

const REMEDY = {
  not_configured: 'Optional. Set AUTOPILOT_SEMRUSH_API_KEY in /etc/mamta-autopilot/autopilot.env to add estimated search volume to the keyword report.',
  no_units: 'The Semrush account has no API units left (or its request limit is used). Buy units or wait for the reset; nothing was measured, so no value is shown (this is not a zero).',
  auth_invalid: 'Semrush rejected the API key (wrong key, or API access is not enabled for this plan). Check AUTOPILOT_SEMRUSH_API_KEY.',
  rate_limited: 'Semrush is rate limiting requests; the autopilot retries on the next scheduled run.',
  network: 'Semrush could not be reached; the autopilot retries on the next scheduled run.',
  api_error: 'Semrush returned an unexpected answer; if it persists, check the plan and the key.',
};

const configured = (cfg) => Boolean(cfg.semrush && cfg.semrush.apiKey);

// -> { kind: 'data', fields } | { kind: 'no_data' } | { kind: <status>, detail }
function parse(status, body) {
  const text = String(body || '').trim();
  if (status === 429) return { kind: 'rate_limited', detail: 'HTTP 429' };
  if (status >= 500) return { kind: 'api_error', detail: `HTTP ${status}` };
  const err = text.match(/^ERROR\s+(\d+)\s*::\s*(.*)$/im);
  if (err) {
    const code = Number(err[1]); const msg = err[2].trim();
    if (code === 50) return { kind: 'no_data' };
    if (code === 120 || code === 130) return { kind: 'auth_invalid', detail: `ERROR ${code} ${msg}` };
    if (code === 131 || code === 132 || /UNITS|LIMIT/i.test(msg)) return { kind: /LIMIT/i.test(msg) && !/UNITS/i.test(msg) && code !== 132 ? 'rate_limited' : 'no_units', detail: `ERROR ${code} ${msg}` };
    return { kind: 'api_error', detail: `ERROR ${code} ${msg}` };
  }
  if (status !== 200) return { kind: 'api_error', detail: `HTTP ${status}` };
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return lines.length === 1 && lines[0].includes(';') ? { kind: 'no_data' } : { kind: 'api_error', detail: 'unrecognised response' }; // a header with no rows is an empty result; anything else is not an answer we understand
  const head = lines[0].split(';'); const row = lines[1].split(';'); const f = {}; head.forEach((h, i) => { f[h.trim()] = row[i]; });
  const vol = Number(f['Search Volume'] != null ? f['Search Volume'] : f.Nq);
  return Number.isFinite(vol) ? { kind: 'data', fields: { volume: vol, cpc: f.CPC != null ? Number(f.CPC) : (f.Cp != null ? Number(f.Cp) : null), competition: f.Competition != null ? Number(f.Competition) : (f.Co != null ? Number(f.Co) : null) } } : { kind: 'api_error', detail: 'unrecognised response' };
}

// cacheDir: results are cached 7 days per keyword so repeated runs never spend API units twice.
async function collect(cfg, keywords, cacheDir) {
  if (!configured(cfg)) return { status: 'not_configured', detail: 'no API key', remedy: REMEDY.not_configured, items: [] };
  const sc = cfg.semrush; const items = []; let status = 'ok'; let detail = '';
  for (const keyword of keywords.slice(0, sc.maxKeywords)) {
    const file = cacheDir ? path.join(cacheDir, `semrush-${sc.database}-${sha1(keyword).slice(0, 12)}.json`) : null;
    const cached = file ? readJson(file, null) : null;
    if (cached && Date.now() - cached.at < 7 * 86400000) { items.push(Object.assign({ keyword, cached: true }, cached.item)); continue; }
    let r;
    try {
      const url = `${sc.base}/?type=phrase_this&key=${encodeURIComponent(sc.apiKey)}&phrase=${encodeURIComponent(keyword)}&database=${encodeURIComponent(sc.database)}&export_columns=Ph,Nq,Cp,Co`;
      const res = await requestRetry(url, { timeoutMs: 15000 }); r = parse(res.status, res.body);
    } catch (e) { r = { kind: 'network', detail: redact(e.message) }; }
    if (r.kind === 'data') { const item = { state: 'data', volume: r.fields.volume, cpc: r.fields.cpc, competition: r.fields.competition }; items.push(Object.assign({ keyword }, item)); if (file) { ensureDir(cacheDir); writeJson(file, { at: Date.now(), item }); } }
    else if (r.kind === 'no_data') { const item = { state: 'no_data' }; items.push(Object.assign({ keyword }, item)); if (file) { ensureDir(cacheDir); writeJson(file, { at: Date.now(), item }); } }
    else { status = r.kind; detail = r.detail || ''; break; } // a quota/auth/network failure ends the batch: the rest were NOT measured
  }
  const done = new Set(items.map((i) => i.keyword));
  for (const keyword of keywords.slice(0, sc.maxKeywords)) if (!done.has(keyword)) items.push({ keyword, state: 'unavailable' });
  return { status, detail: redact(detail), remedy: status === 'ok' ? '' : REMEDY[status] || REMEDY.api_error, items };
}

module.exports = { configured, collect, parse, REMEDY };
