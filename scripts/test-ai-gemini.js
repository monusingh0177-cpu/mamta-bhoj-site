#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-ai-gemini.js   (npm run test:ai)
// Tests the Gemini provider in autopilot/lib/ai.js against a FAKE local Gemini server: success, malformed output, timeout,
// rate limit, auth failure, empty/blocked/truncated output, invalid or non-factual proposals, input/output limits,
// retry limits and the daily budget. It never contacts a real service and never prints or stores a real key.
// =============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
process.env.AUTOPILOT_ENV_FILE = path.join(os.tmpdir(), 'no-such-autopilot-env-file');
process.env.AUTOPILOT_RETRY_BASE_MS = '5';
const { loadConfig } = require(path.join(ROOT, 'autopilot/config'));
const ai = require(path.join(ROOT, 'autopilot/lib/ai'));
const patchLib = require(path.join(ROOT, 'autopilot/lib/patch'));
const { redact } = require(path.join(ROOT, 'autopilot/lib/util'));

let passed = 0; let failed = 0;
const check = (c, name, detail) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${name}${c || !detail ? '' : '  -> ' + String(detail).slice(0, 300)}`); };
const KEY = 'AIzaSy-FAKE-test-key-0123456789abcdef';

function findGuide() {
  for (const f of ['views/guides.js', 'views/guides-more.js', 'views/guides-phase3.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/slug:\s*'([a-z0-9-]+)'/g)) {
      const p = '/guides/' + m[1]; const block = patchLib.sourceBlock(ROOT, p); if (!block) continue;
      const t = block.text.match(/title:\s*'([^']{15,})'/); if (t) return { p, block, find: t[1] };
    }
  }
  throw new Error('no guide block found');
}
const G = findGuide();
const ctx = { opportunity: { query: 'q', kind: 'informational', impressions: 50, clicks: 1, ctr: 0.02, position: 9, flags: [] }, page: { title: G.find, description: 'd', h1: [G.find], headings: [] }, path: G.p, block: G.block };
const decision = (over) => Object.assign({ page: G.p, kind: 'title', file: G.block.file, find: G.find, replace: G.find + ' guide', rationale: 'clearer', confidence: 0.8 }, over || {});
const okBody = (decisions, extra) => JSON.stringify(Object.assign({ candidates: [{ content: { parts: [{ text: JSON.stringify({ decisions }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 90, totalTokenCount: 790 } }, extra || {}));

(async () => {
  const seen = []; let handler = null;
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { seen.push({ url: req.url, key: req.headers['x-goog-api-key'], auth: req.headers.authorization, body: b }); handler(req, res, b); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/v1beta`;
  const reply = (status, body) => (req, res) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body); };
  const mk = (env) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-')); return { dir, cfg: loadConfig(Object.assign({ AUTOPILOT_STATE_DIR: dir, AUTOPILOT_AI_MODE: 'gemini', AUTOPILOT_AI_MODEL: 'gemini-test-model', AUTOPILOT_AI_API_KEY: KEY, AUTOPILOT_AI_BASE_URL: base, AUTOPILOT_AI_TIMEOUT_MS: '1500' }, env || {})) }; };
  const run = async (env, h) => { seen.length = 0; handler = h; const t = mk(env); const r = await ai.propose(t.cfg, ctx); return Object.assign(t, { r }); };

  console.log('\n== Gemini provider');
  let t = await run({}, reply(200, okBody([decision()])));
  check(t.r.decisions && t.r.decisions.length === 1 && t.r.model === 'gemini-test-model', 'successful response gives one decision and the model name', JSON.stringify(t.r));
  check(t.r.usage && t.r.usage.totalTokens === 790 && t.r.usage.promptTokens === 700, 'usage metadata is returned');
  check(seen.length === 1 && seen[0].url === '/v1beta/models/gemini-test-model:generateContent' && seen[0].key === KEY && !seen[0].url.includes(KEY) && !seen[0].auth, 'key travels only in the x-goog-api-key header, never in the URL');
  const sent = JSON.parse(seen[0].body);
  check(sent.generationConfig.maxOutputTokens === 2048 && sent.generationConfig.responseMimeType === 'application/json' && !/AIzaSy|passwordHash|enquiries\.json/i.test(seen[0].body), 'output-token cap and JSON mode are set; the request carries no secrets');
  check(!redact(JSON.stringify(t.r)).includes(KEY) && !JSON.stringify(t.r).includes(KEY), 'result never contains the key');

  t = await run({}, reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'sure! here is my answer, no json' }] }, finishReason: 'STOP' }] })));
  check(t.r.error && /not the required JSON/.test(t.r.error), 'malformed (non-JSON) model output is an error, nothing proposed', JSON.stringify(t.r));
  t = await run({}, reply(200, '<html>not json</html>'));
  check(t.r.error && /malformed/.test(t.r.error), 'a non-JSON HTTP body is a malformed-response error', JSON.stringify(t.r));
  t = await run({}, reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }] })));
  check(t.r.error && /empty/.test(t.r.error), 'empty output is an error', JSON.stringify(t.r));
  t = await run({}, reply(200, JSON.stringify({ candidates: [] })));
  check(t.r.error && /empty|no candidates/.test(t.r.error), 'no candidates is an error');
  t = await run({}, reply(200, JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
  check(t.r.error && /blocked/.test(t.r.error), 'a blocked prompt is an error');
  t = await run({}, reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"decisions":[' }] }, finishReason: 'MAX_TOKENS' }] })));
  check(t.r.error && /cut off/.test(t.r.error), 'output truncated at the token limit is an error');

  t = await run({}, reply(401, JSON.stringify({ error: { code: 401, status: 'UNAUTHENTICATED', message: `bad key ${KEY}` } })));
  check(t.r.error && t.r.category === 'auth' && seen.length === 1 && !t.r.error.includes(KEY), 'authentication failure: classified, not retried, key not echoed', JSON.stringify(t.r) + seen.length);
  t = await run({}, reply(400, JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }], message: 'API key not valid' } })));
  check(t.r.category === 'auth', 'API_KEY_INVALID (HTTP 400) is an authentication failure');
  t = await run({ AUTOPILOT_AI_RETRIES: '2' }, reply(429, JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })));
  check(t.r.category === 'rate_limit' && seen.length === 3, 'rate limit: retried exactly the configured number of times (1 + 2), then reported', JSON.stringify(t.r) + ' calls=' + seen.length);
  t = await run({ AUTOPILOT_AI_RETRIES: '9' }, reply(503, '{}'));
  check(t.r.category === 'unavailable' && seen.length === 4, 'retries are capped at 3 whatever the setting', 'calls=' + seen.length);
  let n = 0; t = await run({}, (q, s) => { n++; if (n === 1) { s.writeHead(503); s.end('{}'); } else reply(200, okBody([decision()]))(q, s); });
  check(t.r.decisions && t.r.decisions.length === 1 && seen.length === 2, 'a transient 503 is retried and then succeeds');
  t = await run({}, reply(404, JSON.stringify({ error: { code: 404, status: 'NOT_FOUND' } })));
  check(t.r.category === 'model' && /AUTOPILOT_AI_MODEL/.test(t.r.error) && seen.length === 1, 'unknown model is reported with a remedy, not retried');
  t = await run({ AUTOPILOT_AI_TIMEOUT_MS: '200', AUTOPILOT_AI_RETRIES: '1' }, () => { /* never answers */ });
  check(t.r.category === 'timeout' && /timed out/.test(t.r.error) && seen.length === 2, 'timeout is enforced and retried once', JSON.stringify(t.r) + ' calls=' + seen.length);
  t = await run({ AUTOPILOT_AI_MODEL: '../evil?x=1' }, reply(200, okBody([])));
  check(t.r.category === 'config' && seen.length === 0, 'a malformed model name is refused before any request');
  t = await run({ AUTOPILOT_AI_API_KEY: '' }, reply(200, okBody([])));
  check(t.r.category === 'config' && seen.length === 0, 'a missing key sends nothing');

  console.log('\n== limits and budget');
  t = await run({ AUTOPILOT_AI_MAX_INPUT_CHARS: '500' }, reply(200, okBody([decision()])));
  check(t.r.error && /too large/.test(t.r.error) && seen.length === 0, 'oversized input is refused before sending');
  t = await run({ AUTOPILOT_AI_DAILY_REQUESTS: '2' }, reply(200, okBody([decision()])));
  let r2 = await ai.propose(t.cfg, ctx); let r3 = await ai.propose(t.cfg, ctx);
  check(t.r.decisions && r2.decisions && r3.skipped && r3.budget && /request budget reached \(2\/2\)/.test(r3.reason) && seen.length === 2, 'daily request budget stops further calls', JSON.stringify(r3));
  const estTok = require(path.join(ROOT, 'autopilot/lib/budget')).estimateTokens(mk({}).cfg, ai.buildPrompt(ctx));
  t = await run({ AUTOPILOT_AI_DAILY_TOKENS: String(estTok + 1000) }, reply(200, okBody([decision()])));
  r2 = await ai.propose(t.cfg, ctx); r3 = await ai.propose(t.cfg, ctx);
  check(r2.decisions && r3.budget && /token budget reached/.test(r3.reason) && seen.length === 2, 'daily token budget stops further calls');
  const u = JSON.parse(fs.readFileSync(path.join(t.dir, 'ai-usage.json'), 'utf8'));
  check(u.requests === 2 && u.tokens === 1580 && !JSON.stringify(u).includes(KEY), 'usage file holds only counters');
  t = await run({ AUTOPILOT_AI_DAILY_REQUESTS: '0', AUTOPILOT_AI_DAILY_TOKENS: '0' }, reply(200, okBody([decision()])));
  check(Boolean(t.r.decisions), 'a budget of 0 means unlimited');

  console.log('\n== invalid and non-factual proposals');
  const vOf = (d) => patchLib.validate(Object.assign({}, d, { page: G.p }), { repoDir: ROOT });
  check(vOf(decision()).ok, 'the baseline fixture decision is a valid patch');
  const bad = [
    ['a price', decision({ replace: G.find + ' from Rs 40 per kg' })], ['a made-up capacity', decision({ replace: G.find + ' 500 tonnes per day' })],
    ['a certification not held', decision({ replace: G.find + ' HACCP' })], ['another city', decision({ replace: G.find + ' Mumbai' })],
    ['a delivery promise', decision({ replace: G.find + ' same-day delivery' })], ['private label', decision({ replace: G.find + ' private label' })],
    ['markup', decision({ replace: G.find + ' <b>x</b>' })], ['a URL', decision({ replace: G.find + ' https://x.example' })],
    ['a non-allow-listed file', decision({ file: 'data/admin.json' })], ['a find text that is not in the source', decision({ find: 'this text does not exist anywhere' })],
  ];
  for (const [name, d] of bad) {
    t = await run({}, reply(200, okBody([d])));
    const v = vOf(d); const passedGrounding = Boolean(t.r.decisions && t.r.decisions[0]);
    check(!v.ok && (passedGrounding || (t.r.rejected || []).length === 1), `an AI proposal with ${name} is rejected before anything is applied`, JSON.stringify(t.r.rejected) + JSON.stringify(v.errors));
  }
  t = await run({}, reply(200, okBody([decision({ replace: G.find + ' for 250 buyers' })])));
  check((t.r.decisions || []).length === 0 && /introduces number/.test((t.r.rejected || [])[0] || ''), 'a rewrite that introduces a new number is rejected by the grounding check', JSON.stringify(t.r));
  t = await run({}, reply(200, okBody([decision({ replace: G.find + ' ISO 9001:2015' })])));
  check((t.r.decisions || []).length === 1, 'approved numbers (ISO 9001:2015) are allowed through grounding');
  t = await run({}, reply(200, okBody([decision(), decision({ kind: 'copy' }), decision({ kind: 'description' }), decision({ kind: 'title' }), 'junk', null])));
  check(t.r.decisions.length + t.r.rejected.length <= 3, 'at most three decisions are considered');
  t = await run({}, reply(200, okBody([null, 'x'])));
  check(t.r.decisions.length === 0 && t.r.rejected.length === 2, 'non-object decisions are rejected');

  console.log('\n== operator checks');
  t = mk({}); handler = reply(200, okBody([], {})); handler = reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 12 } }));
  const sm = await ai.smoke(t.cfg); check(sm.ok && sm.model === 'gemini-test-model' && sm.usage.totalTokens === 12 && !JSON.stringify(sm).includes(KEY), 'smoke test reports success, model and usage only');
  handler = reply(401, '{}'); const sm2 = await ai.smoke(mk({}).cfg); check(!sm2.ok && /auth/.test(sm2.detail), 'smoke test reports an authentication failure');
  handler = reply(200, okBody([decision()])); const fx = await ai.fixtureCheck(mk({}).cfg, ROOT);
  check(fx.ok && fx.checked && fx.checked.length === 1 && !JSON.stringify(fx).includes(KEY), 'fixture proposal check validates decisions without applying anything', JSON.stringify(fx));
  check(require('child_process').execFileSync('git', ['status', '--porcelain', '--', 'views'], { cwd: ROOT, encoding: 'utf8' }).trim() === '', 'the fixture check left the views/ sources untouched');

  console.log('\n== key installer (hidden input, atomic update)');
  {
    const { spawnSync } = require('child_process'); const d = fs.mkdtempSync(path.join(os.tmpdir(), 'setkey-')); const envf = path.join(d, 'e.env'); const tty = path.join(d, 'tty');
    fs.writeFileSync(envf, 'AUTOPILOT_MODE=auto\nAUTOPILOT_GOOGLE_CLIENT_SECRET=keep-me-0123456789\nAUTOPILOT_AI_MODE=none\nAUTOPILOT_TZ=x\n', { mode: 0o600 });
    const sh = path.join(ROOT, 'deploy/autopilot/set-ai-key.sh'); const run = (key, extra) => { fs.writeFileSync(tty, key + '\n'); return spawnSync('bash', [sh, '--env-file', envf].concat(extra || []), { encoding: 'utf8', env: Object.assign({}, process.env, { SET_AI_KEY_TTY: tty }) }); };
    let r = run('bad key!');
    check(r.status === 1 && !fs.readFileSync(envf, 'utf8').includes('AUTOPILOT_AI_API_KEY') && fs.readdirSync(d).length === 2, 'an implausible key changes nothing and makes no backup');
    // invalid inputs: each must change nothing, make no backup and never echo the input
    const invalid = [['empty', ''], ['too short (19)', 'A'.repeat(19)], ['too long (513)', 'A'.repeat(513)], ['an inner space', 'AQ.' + 'x'.repeat(10) + ' ' + 'y'.repeat(10)], ['a trailing space', 'AQ.' + 'x'.repeat(30) + ' '], ['a tab', 'AQ.' + 'x'.repeat(10) + '\t' + 'y'.repeat(10)], ['a double quote', 'AQ.' + 'x'.repeat(30) + '"'], ['a command substitution', 'AQ.$(touch_pwned)' + 'x'.repeat(20)], ['a backtick', 'AQ.`id`' + 'x'.repeat(25)], ['a semicolon', 'AQ.' + 'x'.repeat(30) + ';rm'], ['a hash', 'AQ.' + 'x'.repeat(30) + '#c'], ['a backslash', 'AQ.' + 'x'.repeat(30) + '\\n'], ['a non-ASCII character', 'AQ.' + 'x'.repeat(30) + 'é']];
    for (const [name, v] of invalid) {
      const x = run(v); const untouched = !fs.readFileSync(envf, 'utf8').includes('AUTOPILOT_AI_API_KEY') && fs.readdirSync(d).length === 2;
      check(x.status !== 0 && untouched && (!v || !(x.stdout + x.stderr).includes(v)), `key input with ${name} is rejected, nothing changes, input not echoed`, x.status + ' ' + x.stderr);
    }
    // supported formats: the classic AIza key, the newer AQ.<token> key (contains a dot), and the longest allowed
    for (const [name, v] of [['classic AIza (39 chars)', 'AIzaSy' + 'a1B2-c3D4_e5F6g7H8i9J0k1L2m3N4o'], ['new AQ.<token> with dots', 'AQ.Ab8RN6' + 'x1Y2.z3-Q4_w5.e6R7t8Y9u0I1o2P3'], ['base64-style characters', 'AQ.abc+def/ghi~jkl=mno' + 'x'.repeat(10)], ['exactly 20 characters', 'A'.repeat(20)], ['exactly 512 characters', 'A'.repeat(512)]]) {
      const x = run(v); const got = fs.readFileSync(envf, 'utf8');
      check(x.status === 0 && got.includes('AUTOPILOT_AI_API_KEY=' + v + '\n') && !(x.stdout + x.stderr).includes(v), `${name} is accepted and stored verbatim, never printed`, x.stderr);
      fs.writeFileSync(envf, 'AUTOPILOT_MODE=auto\nAUTOPILOT_GOOGLE_CLIENT_SECRET=keep-me-0123456789\nAUTOPILOT_AI_MODE=none\nAUTOPILOT_TZ=x\n', { mode: 0o600 });
      for (const f of fs.readdirSync(d)) if (f.includes('.bak-')) fs.rmSync(path.join(d, f));
    }
    check(!fs.existsSync(path.join(ROOT, 'touch_pwned')) && !fs.existsSync(path.join(d, 'touch_pwned')), 'no input was ever evaluated as shell code');
    r = run(KEY); let e = fs.readFileSync(envf, 'utf8');
    check(r.status === 0 && /^AUTOPILOT_AI_MODE=none$/m.test(e) && e.includes('AUTOPILOT_AI_API_KEY=' + KEY), 'without --enable the AI mode is left unchanged');
    r = run(KEY, ['--enable']); e = fs.readFileSync(envf, 'utf8');
    check(r.status === 0 && e.includes('AUTOPILOT_AI_MODE=gemini') && e.includes('AUTOPILOT_AI_API_KEY=' + KEY) && e.includes('AUTOPILOT_GOOGLE_CLIENT_SECRET=keep-me-0123456789') && e.includes('AUTOPILOT_MODE=auto') && !/AUTOPILOT_AI_MODE=none/.test(e), 'the key is stored and every other setting (mode, Google secret) is preserved', r.stderr);
    check(!(r.stdout + r.stderr).includes(KEY), 'the installer never prints the key');
    const bak = fs.readdirSync(d).filter((f) => f.includes('.bak-'));
    check(bak.length >= 1 && (process.platform === 'win32' || (fs.statSync(envf).mode & 0o777) === 0o600), 'a backup of the previous file was made and the file mode stays 600');
    fs.rmSync(d, { recursive: true, force: true });
  }

  srv.close();
  console.log(`\nGEMINI TESTS ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test harness error:', e.message); process.exit(1); });
