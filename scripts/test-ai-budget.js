#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-ai-budget.js   (npm run test:ai-budget)
// Tests the HARD daily AI budget (autopilot/lib/budget.js + lib/ai.js) with a FAKE local Gemini server and real
// concurrent processes: the request limit is a cap on outbound HTTP attempts (retries included), every attempt is
// reserved BEFORE it is sent, usage is never lost across processes, the budget day is an explicit time zone, and a
// corrupt / unwritable / locked budget state fails closed. It never contacts a real service and prints no key.
// =============================================================================
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.env.AUTOPILOT_ENV_FILE = path.join(os.tmpdir(), 'no-such-autopilot-env-file');
process.env.AUTOPILOT_RETRY_BASE_MS = '2';
const { loadConfig } = require(path.join(ROOT, 'autopilot/config'));
const ai = require(path.join(ROOT, 'autopilot/lib/ai'));
const budget = require(path.join(ROOT, 'autopilot/lib/budget'));
const patchLib = require(path.join(ROOT, 'autopilot/lib/patch'));

let passed = 0; let failed = 0;
const check = (c, name, detail) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${name}${c || !detail ? '' : '  -> ' + String(detail).slice(0, 300)}`); };
const KEY = 'AIzaSy-FAKE-budget-test-key-0123456789';

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
const okBody = (usage) => JSON.stringify(Object.assign({ candidates: [{ content: { parts: [{ text: JSON.stringify({ decisions: [] }) }] }, finishReason: 'STOP' }] }, usage === null ? {} : { usageMetadata: usage || { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } }));
const readUsage = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'ai-usage.json'), 'utf8'));

(async () => {
  let hits = 0; let handler = null; const sockets = new Set();
  const srv = http.createServer((req, res) => { hits++; req.resume(); req.on('end', () => handler(req, res)); });
  srv.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/v1beta`;
  const reply = (status, body) => (req, res) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body); };
  const mk = (env, now) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); const e = Object.assign({ AUTOPILOT_STATE_DIR: dir, AUTOPILOT_AI_MODE: 'gemini', AUTOPILOT_AI_MODEL: 'gemini-test-model', AUTOPILOT_AI_API_KEY: KEY, AUTOPILOT_AI_BASE_URL: base, AUTOPILOT_AI_TIMEOUT_MS: '1500', AUTOPILOT_AI_RETRIES: '0', AUTOPILOT_AI_DAILY_TOKENS: '0' }, env || {}); if (now) e.AUTOPILOT_NOW = now; return { dir, cfg: loadConfig(e) }; };
  const call = async (t, h) => { if (h) handler = h; return ai.propose(t.cfg, ctx); };

  console.log('\n== the request limit is a hard cap on outbound attempts (retries included)');
  let t = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_AI_RETRIES: '3' }); hits = 0;
  let r1 = await call(t, reply(503, '{}')); let r2 = await call(t); let r3 = await call(t);
  check(hits === 10, 'limit 10 with 3 retries per call: the server received exactly 10 requests (4 + 4 + 2)', 'hits=' + hits);
  check(r3.skipped && r3.budget && /request budget reached \(10\/10\)/.test(r3.reason) && /retry not sent/.test(r3.reason), 'the retry that would have been request number 11 was refused and says so', JSON.stringify(r3));
  const before = hits; const r4 = await call(t); const r5 = await call(t);
  check(hits === before && r4.skipped && r4.budget && r5.budget, 'further calls are rejected before any HTTP request is sent');
  check(readUsage(t.dir).requests === 10, 'the counter reads exactly 10 (never 11)', JSON.stringify(readUsage(t.dir)));
  check(r1.error && /unavailable/.test(r1.error) && r2.error, 'earlier calls still report the real provider error');

  t = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '1' }); hits = 0; await call(t, reply(200, okBody()));
  const ra = await call(t);
  check(hits === 1 && ra.budget && /\(1\/1\)/.test(ra.reason), 'a limit of 1 allows one attempt and refuses the next before sending');
  check(!(JSON.stringify(ra) + JSON.stringify(readUsage(t.dir))).includes(KEY), 'results and the usage file never contain the key');

  console.log('\n== every attempt is counted, whatever the outcome');
  const kinds = [
    ['a 429', reply(429, '{}')], ['a 503', reply(503, '{}')], ['a 401', reply(401, '{}')], ['a malformed 200 body', reply(200, '<html>nope</html>')],
    ['a connection reset', (q, s) => s.destroy()], ['a timeout', () => { /* never answers */ }],
  ];
  for (const [name, h] of kinds) {
    t = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_AI_TIMEOUT_MS: '150' }); hits = 0; await call(t, h);
    check(hits === 1 && readUsage(t.dir).requests === 1, `${name} counts as exactly one attempt`, `hits=${hits} usage=${JSON.stringify(readUsage(t.dir))}`);
  }
  { // connection refused (nothing is listening): the attempt is still counted
    const free = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
    t = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_AI_BASE_URL: `http://127.0.0.1:${free}/v1beta` }); const x = await ai.propose(t.cfg, ctx);
    check(x.category === 'network' && readUsage(t.dir).requests === 1, 'a refused connection counts as one attempt');
  }
  t = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_AI_RETRIES: '2' }); hits = 0; await call(t, reply(429, '{}'));
  check(hits === 3 && readUsage(t.dir).requests === 3, 'a 429 retried twice counts as three attempts');

  console.log('\n== token budget: reserved before sending, settled afterwards');
  const probe = mk({}); const est = budget.estimateTokens(probe.cfg, ai.buildPrompt(ctx));
  check(est === Math.ceil(ai.buildPrompt(ctx).length / 3) + 4096, 'the documented estimate is input characters / 3 plus the output-token cap');
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: String(est - 1) }); hits = 0; const tx = await call(t, reply(200, okBody()));
  check(hits === 0 && tx.budget && /token budget reached/.test(tx.reason), 'a request whose worst case exceeds the token budget is refused before sending');
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: '100000' }); await call(t, reply(200, okBody({ totalTokenCount: 777, promptTokenCount: 700, candidatesTokenCount: 77 })));
  check(readUsage(t.dir).tokens === 777, 'provider-reported usage replaces the estimate', JSON.stringify(readUsage(t.dir)));
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: '100000' }); await call(t, reply(200, okBody(null)));
  check(readUsage(t.dir).tokens === est, 'a 200 without usage metadata keeps the conservative estimate');
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: '100000' }); await call(t, reply(503, '{}'));
  check(readUsage(t.dir).tokens === est, 'a 5xx (consumption unknown) keeps the estimate');
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: '100000', AUTOPILOT_AI_TIMEOUT_MS: '150' }); await call(t, () => {});
  check(readUsage(t.dir).tokens === est, 'a timeout (consumption unknown) keeps the estimate');
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: '100000' }); await call(t, reply(429, '{}'));
  check(readUsage(t.dir).tokens === 0 && readUsage(t.dir).requests === 1, 'a 4xx answer (rejected before generation) releases the estimate but still counts the request');
  t = mk({ AUTOPILOT_AI_DAILY_TOKENS: String(est * 2 + 500) }); hits = 0; await call(t, reply(503, '{}')); await call(t); const third = await call(t);
  check(hits === 2 && third.budget, 'repeated unknown-consumption failures cannot overshoot the token budget');
  const abandoned = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '5', AUTOPILOT_AI_DAILY_TOKENS: '50000' });
  const rsv = budget.reserve(abandoned.cfg, 1234); // simulates a process that dies right after reserving: nothing settles it
  check(rsv.ok && readUsage(abandoned.dir).requests === 1 && readUsage(abandoned.dir).tokens === 1234, 'an abandoned reservation stays counted (conservative, never an unbounded request flow)');

  console.log('\n== concurrent processes cannot exceed the limit or lose increments');
  const worker = path.join(os.tmpdir(), `bud-worker-${process.pid}.js`);
  fs.writeFileSync(worker, `const budget = require(${JSON.stringify(path.join(ROOT, 'autopilot/lib/budget'))});
const a = JSON.parse(process.argv[2]); const cfg = { stateDir: a.dir, now: new Date(a.now), timezone: 'Asia/Kolkata', ai: { dailyRequests: a.limit, dailyTokens: 0, maxOutputTokens: 0, lockWaitMs: 30000, budgetTz: 'Asia/Kolkata' } };
let ok = 0; let refused = 0; let errors = 0;
for (let i = 0; i < a.n; i++) { try { const r = budget.reserve(cfg, 0); if (r.ok) ok++; else refused++; } catch (e) { errors++; } }
process.stdout.write(JSON.stringify({ ok, refused, errors }));
`);
  const runWorkers = (dir, workers, n, limit) => Promise.all(Array.from({ length: workers }, () => new Promise((resolve) => {
    const c = spawn(process.execPath, [worker, JSON.stringify({ dir, n, limit, now: '2026-10-15T10:00:00Z' })]); let out = '';
    c.stdout.on('data', (d) => { out += d; }); c.on('close', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve({ ok: 0, refused: 0, errors: 999 }); } });
  })));
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); let rs = await runWorkers(dir, 8, 5, 10);
  const sum = (k) => rs.reduce((a, x) => a + x[k], 0);
  check(sum('ok') === 10 && sum('refused') === 30 && sum('errors') === 0 && readUsage(dir).requests === 10, '8 processes x 5 attempts against a limit of 10: exactly 10 granted, 30 refused, counter 10', JSON.stringify(rs.map((x) => x.ok)) + JSON.stringify(readUsage(dir)));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); rs = await runWorkers(dir, 6, 25, 0);
  check(sum('ok') === 150 && sum('errors') === 0 && readUsage(dir).requests === 150, '6 processes x 25 reservations with no limit: no increment is lost (150 of 150)', JSON.stringify(readUsage(dir)) + JSON.stringify(rs));
  // heavier contention (reproduced the Windows EPERM-on-delete-pending lock race in ~40% of rounds before the fix)
  for (let round = 0; round < 3; round++) { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); rs = await runWorkers(dir, 16, 25, 0); check(sum('ok') === 400 && sum('errors') === 0 && readUsage(dir).requests === 400, `16 processes x 25 reservations (round ${round + 1}): every reservation succeeds and the counter is exactly 400`, JSON.stringify(readUsage(dir)) + JSON.stringify(rs.filter((x) => x.errors))); }
  fs.rmSync(worker, { force: true });
  check(!fs.existsSync(path.join(dir, 'ai-usage.json.lock')), 'the lock is released after use');

  console.log('\n== the budget day is an explicit time zone');
  const reserveAt = (env, now) => { const x = mk(env, now); return x; };
  { // default zone: Asia/Kolkata (UTC+5:30), so the day changes at 18:30 UTC
    const dirX = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-'));
    const cfgAt = (now, env) => loadConfig(Object.assign({ AUTOPILOT_STATE_DIR: dirX, AUTOPILOT_AI_MODE: 'gemini', AUTOPILOT_AI_DAILY_REQUESTS: '2', AUTOPILOT_NOW: now }, env || {}));
    check(cfgAt('2026-10-15T00:00:00Z').ai.budgetTz === 'Asia/Kolkata', 'the default budget time zone is Asia/Kolkata');
    budget.reserve(cfgAt('2026-10-15T18:29:00Z'), 0); budget.reserve(cfgAt('2026-10-15T18:29:30Z'), 0);
    check(!budget.reserve(cfgAt('2026-10-15T18:29:59Z'), 0).ok, 'IST 23:59:59 on 15 Oct: the 15 Oct budget is spent');
    const nxt = budget.reserve(cfgAt('2026-10-15T18:30:00Z'), 0);
    check(nxt.ok && readUsage(dirX).day === '2026-10-16' && readUsage(dirX).requests === 1, 'IST 00:00:00 on 16 Oct (18:30:00 UTC): a fresh day starts with 1 request counted');
    check(budget.snapshot(cfgAt('2026-10-15T20:00:00Z')).day === '2026-10-16' && budget.snapshot(cfgAt('2026-10-15T20:00:00Z')).tz === 'Asia/Kolkata', 'the snapshot reports the budget day and zone');
    // UTC zone: the day changes at 00:00 UTC, and 18:30 UTC does NOT reset
    const dirU = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); const cu = (now) => loadConfig({ AUTOPILOT_STATE_DIR: dirU, AUTOPILOT_AI_MODE: 'gemini', AUTOPILOT_AI_DAILY_REQUESTS: '2', AUTOPILOT_AI_BUDGET_TZ: 'UTC', AUTOPILOT_NOW: now });
    budget.reserve(cu('2026-10-15T10:00:00Z'), 0); budget.reserve(cu('2026-10-15T11:00:00Z'), 0);
    check(!budget.reserve(cu('2026-10-15T18:30:00Z'), 0).ok, 'with AUTOPILOT_AI_BUDGET_TZ=UTC 18:30 UTC is still the same day (no reset)');
    check(!budget.reserve(cu('2026-10-15T23:59:59Z'), 0).ok && budget.reserve(cu('2026-10-16T00:00:00Z'), 0).ok, 'with UTC the reset is exactly at 00:00:00 UTC');
    // a call that started on the old day must not clobber the new day when it settles
    const dirS = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); const cs = (now) => loadConfig({ AUTOPILOT_STATE_DIR: dirS, AUTOPILOT_AI_MODE: 'gemini', AUTOPILOT_AI_DAILY_REQUESTS: '5', AUTOPILOT_AI_BUDGET_TZ: 'UTC', AUTOPILOT_NOW: now });
    const old = budget.reserve(cs('2026-10-15T23:59:59Z'), 500); budget.reserve(cs('2026-10-16T00:00:01Z'), 100); budget.settle(cs('2026-10-16T00:00:02Z'), old, 50);
    check(readUsage(dirS).day === '2026-10-16' && readUsage(dirS).tokens === 100 && readUsage(dirS).requests === 1, 'settling a reservation from the previous day leaves the new day untouched', JSON.stringify(readUsage(dirS)));
    // the file written by the first release (UTC "date" key) is carried over: the upgrade cannot grant a free reset
    const dirO = fs.mkdtempSync(path.join(os.tmpdir(), 'bud-')); fs.writeFileSync(path.join(dirO, 'ai-usage.json'), JSON.stringify({ date: '2026-10-15', requests: 2, tokens: 10 }));
    const co = (now) => loadConfig({ AUTOPILOT_STATE_DIR: dirO, AUTOPILOT_AI_MODE: 'gemini', AUTOPILOT_AI_DAILY_REQUESTS: '2', AUTOPILOT_NOW: now });
    check(!budget.reserve(co('2026-10-15T10:00:00Z'), 0).ok, 'an old-format file for today is honoured (counts carried over)');
    fs.writeFileSync(path.join(dirO, 'ai-usage.json'), JSON.stringify({ date: '2026-10-13', requests: 2, tokens: 10 }));
    check(budget.reserve(co('2026-10-15T10:00:00Z'), 0).ok, 'an old-format file for an earlier day is a new day');
    // an invalid zone fails closed
    const bad = mk({ AUTOPILOT_AI_BUDGET_TZ: 'Mars/Olympus' }); hits = 0; const bz = await call(bad, reply(200, okBody()));
    check(hits === 0 && bz.skipped && bz.budget && /time zone/.test(bz.reason), 'an invalid budget time zone fails closed (nothing sent)');
  }
  void reserveAt;

  console.log('\n== corrupt, unwritable or locked state fails closed');
  const stateCase = async (name, setup, expect) => {
    const x = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_AI_LOCK_WAIT_MS: '300' }); const snap = setup(x); hits = 0; const r = await call(x, reply(200, okBody()));
    check(hits === 0 && r.skipped && r.budget && expect.test(r.reason), `${name}: nothing is sent and the budget refuses`, JSON.stringify(r) + ' hits=' + hits);
    return { x, snap };
  };
  let cs1 = await stateCase('a corrupt state file', (x) => { fs.writeFileSync(path.join(x.dir, 'ai-usage.json'), '{not json'); return '{not json'; }, /corrupt/);
  check(fs.readFileSync(path.join(cs1.x.dir, 'ai-usage.json'), 'utf8') === '{not json', 'the corrupt file is left exactly as it was (never reset or overwritten)');
  await stateCase('an invalid state file (negative count)', (x) => fs.writeFileSync(path.join(x.dir, 'ai-usage.json'), JSON.stringify({ day: '2026-10-15', requests: -5, tokens: 0 })), /invalid/);
  await stateCase('a state path that is a directory', (x) => fs.mkdirSync(path.join(x.dir, 'ai-usage.json')), /unreadable/);
  { const blocker = path.join(os.tmpdir(), `bud-file-${process.pid}`); fs.writeFileSync(blocker, 'x');
    const x = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_STATE_DIR: path.join(blocker, 'sub') }); hits = 0; const r = await call(x, reply(200, okBody()));
    check(hits === 0 && r.skipped && r.budget && /state directory/.test(r.reason), 'an unusable (unwritable) state directory: nothing is sent'); fs.rmSync(blocker, { force: true }); }
  { const x = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10', AUTOPILOT_AI_LOCK_WAIT_MS: '300' }); const lock = path.join(x.dir, 'ai-usage.json.lock'); fs.writeFileSync(lock, '99999 1\n'); hits = 0;
    const r = await call(x, reply(200, okBody()));
    check(hits === 0 && r.budget && /lock is busy/.test(r.reason) && fs.existsSync(lock), 'a lock held by a live process makes the request wait, then refuse (fail closed); the lock is not stolen');
    const old = new Date(Date.now() - 60000); fs.utimesSync(lock, old, old); hits = 0; const r2 = await call(x, reply(200, okBody()));
    check(hits === 1 && !r2.budget && readUsage(x.dir).requests === 1, 'a stale lock (left by a dead process) is cleared and the request proceeds'); }
  { const x = mk({ AUTOPILOT_AI_DAILY_REQUESTS: '10' }); const sm = await (async () => { handler = reply(200, okBody()); fs.writeFileSync(path.join(x.dir, 'ai-usage.json'), 'garbage'); hits = 0; return ai.smoke(x.cfg); })();
    check(!sm.ok && hits === 0 && /corrupt/.test(sm.detail), 'verify-ai (smoke test) also fails closed on a corrupt state'); }

  console.log('\n== other providers share the same hard cap');
  { const x = mk({ AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_DAILY_REQUESTS: '1', AUTOPILOT_AI_BASE_URL: base.replace('/v1beta', '') }); hits = 0;
    handler = reply(200, JSON.stringify({ choices: [{ message: { content: '{"decisions":[]}' } }], usage: { total_tokens: 55 } }));
    const a1 = await ai.propose(x.cfg, ctx); const a2 = await ai.propose(x.cfg, ctx);
    check(hits === 1 && a1.decisions && a2.budget, 'openai-compatible mode: limit 1 sends one request and refuses the next before sending');
    check(readUsage(x.dir).requests === 1 && readUsage(x.dir).tokens === 55, 'openai-compatible mode: usage is reported tokens, counted once'); }
  { const x = mk({ AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_DAILY_REQUESTS: '5', AUTOPILOT_AI_BASE_URL: base.replace('/v1beta', ''), AUTOPILOT_AI_TIMEOUT_MS: '150' }); hits = 0; handler = () => {};
    await ai.propose(x.cfg, ctx);
    check(hits === 1 && readUsage(x.dir).requests === 1, 'openai-compatible mode: a timeout is counted (the old code recorded usage only after a response)'); }

  for (const s of sockets) s.destroy();
  srv.close();
  console.log(`\nBUDGET TESTS ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test harness error:', e.stack || e.message); process.exit(1); });
