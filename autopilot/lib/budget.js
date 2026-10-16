'use strict';
// Daily AI budget: a HARD cap on outbound AI HTTP attempts and on tokens, shared by every process that talks to an AI
// provider (the timer run, a manual verify-ai, retries). State is one small JSON file in the state directory.
//
//  * reserve() runs BEFORE every outbound attempt (the first one and every retry): under an exclusive lock it re-reads the
//    file, refuses if the attempt would pass the limit, and otherwise counts it immediately. Counting happens before sending,
//    so a crash, timeout or abandoned process can never lead to an unbounded number of requests (an attempt that never
//    completed simply stays counted: the cap is conservative).
//  * Tokens are reserved the same way using a documented conservative ESTIMATE (input characters / 3 + the output-token
//    cap), then settle() replaces the estimate with the provider-reported total when the answer carries one. A 4xx answer
//    (auth, rate limit, bad request: rejected before generation) releases the estimate; timeouts, network errors and 5xx keep
//    it because the real consumption is unknown.
//  * The day is a calendar day in a configurable time zone (AUTOPILOT_AI_BUDGET_TZ, default AUTOPILOT_TZ, default
//    Asia/Kolkata), so the budget resets at Indian midnight, not at 05:30 IST.
//  * Fail closed: a corrupt/unreadable state file, an unwritable state directory, an invalid time zone or a lock that cannot
//    be taken in time all END IN A REFUSAL. Nothing is ever reset automatically and the file is never overwritten when it cannot
//    be parsed.
const fs = require('fs');
const path = require('path');
const { zonedDate } = require('./util');

class BudgetError extends Error { constructor(message) { super(message); this.category = 'budget_state'; } }

const STALE_LOCK_MS = 10000;
const usageFile = (cfg) => path.join(cfg.stateDir, 'ai-usage.json');
const lockFile = (cfg) => usageFile(cfg) + '.lock';
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { const t = Date.now() + ms; while (Date.now() < t) { /* spin */ } } };

function dayOf(cfg, tz) {
  const now = cfg.now || new Date();
  try { return zonedDate(now, tz).date; } catch (e) { throw new BudgetError(`AI budget time zone "${tz}" is not valid`); }
}
const budgetTz = (cfg) => cfg.ai.budgetTz || cfg.timezone || 'Asia/Kolkata';

// Conservative documented estimate for one request: ONE token per 3 UTF-8 BYTES of input (English text is ~4 characters per token, so
// this over-counts; multi-byte text such as Devanagari or typographic dashes is counted by its bytes) plus the FULL output cap (thought
// tokens count against that cap). It is the worst case the provider can bill for the request, reserved before anything is sent.
function estimateTokens(cfg, prompt) { return Math.ceil(Buffer.byteLength(String(prompt || ''), 'utf8') / 3) + Math.max(0, cfg.ai.maxOutputTokens || 0); }

function acquire(cfg) {
  const lf = lockFile(cfg); const waitMs = Math.max(50, cfg.ai.lockWaitMs || 5000); const t0 = Date.now();
  try { fs.mkdirSync(cfg.stateDir, { recursive: true, mode: 0o750 }); } catch (e) { throw new BudgetError('AI budget state directory is not usable'); }
  for (;;) {
    try { const fd = fs.openSync(lf, 'wx', 0o600); try { fs.writeSync(fd, `${process.pid} ${Date.now()}\n`); } finally { fs.closeSync(fd); } return; } catch (e) {
      // Windows reports EPERM/EACCES (not EEXIST) while a just-released lock file is still delete-pending because another process
      // holds a handle on it for an instant. That is contention, not a fault: wait and retry inside the same bounded window. On other
      // platforms those codes are real permission errors and still fail closed immediately.
      const transient = process.platform === 'win32' && (e.code === 'EPERM' || e.code === 'EACCES');
      if (e.code !== 'EEXIST' && !transient) throw new BudgetError(`AI budget lock cannot be created (${e.code || 'error'})`);
    }
    // a lock older than STALE_LOCK_MS belongs to a process that died: move it aside atomically (only one contender wins the rename)
    try { const age = Date.now() - fs.statSync(lf).mtimeMs; if (age > STALE_LOCK_MS) { const aside = `${lf}.stale-${process.pid}-${Date.now()}`; try { fs.renameSync(lf, aside); fs.unlinkSync(aside); } catch (e) { /* lost the race: someone else took it */ } continue; } } catch (e) { /* vanished: retry */ }
    if (Date.now() - t0 > waitMs) throw new BudgetError('AI budget lock is busy; refusing to send (fail closed)');
    sleepSync(5 + Math.floor(Math.random() * 15));
  }
}
const release = (cfg) => { try { fs.unlinkSync(lockFile(cfg)); } catch (e) { /* already gone */ } };

// Parse the state for `day`. Missing file -> fresh. Unparseable/invalid -> BudgetError (never silently reset).
function load(cfg, day) {
  const file = usageFile(cfg); let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { day, requests: 0, tokens: 0, match: false }; throw new BudgetError(`AI budget state is unreadable (${e.code || 'error'}); refusing to send (fail closed)`); }
  let j; try { j = JSON.parse(raw); } catch (e) { throw new BudgetError('AI budget state is corrupt; refusing to send (fail closed). Inspect ai-usage.json; it is never reset automatically'); }
  const ok = (v) => Number.isFinite(v) && v >= 0;
  if (!j || typeof j !== 'object' || !ok(j.requests) || !ok(j.tokens)) throw new BudgetError('AI budget state is invalid; refusing to send (fail closed)');
  if (typeof j.day === 'string') return j.day === day ? { day, requests: j.requests, tokens: j.tokens, match: true } : { day, requests: 0, tokens: 0, match: false };
  // file written by the first release (UTC "date" key): carry its counts into today so the upgrade cannot grant a free reset
  if (typeof j.date === 'string') { const utc = (cfg.now || new Date()).toISOString().slice(0, 10); return j.date === utc || j.date === day ? { day, requests: j.requests, tokens: j.tokens, match: true } : { day, requests: 0, tokens: 0, match: false }; }
  throw new BudgetError('AI budget state is invalid; refusing to send (fail closed)');
}
function save(cfg, u) {
  const file = usageFile(cfg); const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify({ day: u.day, tz: budgetTz(cfg), requests: u.requests, tokens: u.tokens }) + '\n', { mode: 0o640 }); fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch (x) { /* ignore */ } throw new BudgetError(`AI budget state cannot be written (${e.code || 'error'}); refusing to send (fail closed)`); }
}
function locked(cfg, fn) { acquire(cfg); try { return fn(); } finally { release(cfg); } }

// -> { ok:true, est, usage } or { ok:false, reason, usage }; throws BudgetError when the state cannot be trusted.
function reserve(cfg, est) {
  const a = cfg.ai; const day = dayOf(cfg, budgetTz(cfg)); const e = Math.max(0, est || 0);
  return locked(cfg, () => {
    const u = load(cfg, day);
    if (a.dailyRequests > 0 && u.requests + 1 > a.dailyRequests) return { ok: false, reason: `daily AI request budget reached (${u.requests}/${a.dailyRequests}); nothing was sent`, usage: u };
    if (a.dailyTokens > 0 && u.tokens + e > a.dailyTokens) return { ok: false, reason: `daily AI token budget reached (${u.tokens} used, this request needs up to ${e}, limit ${a.dailyTokens}); nothing was sent`, usage: u };
    u.requests += 1; u.tokens += e; save(cfg, u);
    return { ok: true, est: e, day, usage: u };
  });
}

// Replace the estimate of a reservation with what really happened. actual = provider-reported tokens, or null to keep the
// estimate (unknown consumption), or 0 to release it (request rejected before any generation). Never throws: on failure the
// estimate simply stays counted, which is the conservative outcome.
function settle(cfg, reservation, actual) {
  if (!reservation || actual === null || actual === undefined || !reservation.ok) return;
  try {
    locked(cfg, () => {
      const u = load(cfg, reservation.day);
      if (!u.match) return; // the file is for another day (rolled over while the call ran): leave it alone
      u.tokens = Math.max(0, u.tokens - reservation.est + Math.max(0, actual)); save(cfg, u);
    });
  } catch (e) { /* keep the conservative estimate */ }
}

// Read-only snapshot for status/verify output (no lock needed to read). Never throws.
function snapshot(cfg) {
  try { const day = dayOf(cfg, budgetTz(cfg)); const u = load(cfg, day); return { day, tz: budgetTz(cfg), requests: u.requests, tokens: u.tokens }; } catch (e) { return { error: e.message }; }
}

module.exports = { BudgetError, reserve, settle, snapshot, estimateTokens, budgetTz };
