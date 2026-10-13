'use strict';
// Persistent state (outside the web root): state.json, history, hashes, lastmod map, enabled flag, run lock,
// and the append-only audit log (one JSON object per line, monthly files).
const fs = require('fs');
const path = require('path');
const { ensureDir, readJson, writeJson, today, redact, addDays, daysBetween } = require('./util');

function paths(cfg) {
  const d = cfg.stateDir;
  return { dir: d, state: path.join(d, 'state.json'), lastmod: path.join(d, 'lastmod.json'), disabled: path.join(d, 'DISABLED'), lock: path.join(d, 'run.lock'),
    reports: path.join(d, 'reports'), snapshots: path.join(d, 'snapshots'), cache: path.join(d, 'cache'), auditDir: path.join(d, 'audit'), indexnowState: path.join(d, 'indexnow-state.json'), indexnowLog: path.join(d, 'indexnow.log'), ledger: path.join(d, 'runs.jsonl'), lastRun: path.join(d, 'last-run.json') };
}

function init(cfg) {
  const p = paths(cfg);
  [p.dir, p.reports, p.snapshots, p.cache, p.auditDir].forEach((x) => ensureDir(x));
  return p;
}

const EMPTY = () => ({ version: 1, initialAuditDone: false, createdAt: new Date().toISOString(), hashes: {}, pageCount: null, history: [], inspections: {}, lastRun: null, lastNewPageAt: null, lastHealth: null, lastWeekly: null });

function load(cfg) { return Object.assign(EMPTY(), readJson(paths(cfg).state, {})); }
function save(cfg, st) { writeJson(paths(cfg).state, st); }

function loadLastmod(cfg) { return readJson(paths(cfg).lastmod, {}); }
function saveLastmod(cfg, m) { writeJson(paths(cfg).lastmod, m); }

const isDisabled = (cfg) => fs.existsSync(paths(cfg).disabled);
function setEnabled(cfg, on) {
  const p = init(cfg);
  if (on) { try { fs.unlinkSync(p.disabled); } catch (e) { /* already enabled */ } } else fs.writeFileSync(p.disabled, `disabled ${new Date().toISOString()}\n`);
}

// Single-run lock, created atomically (O_EXCL), so two simultaneous starts can never both win. A lock is stale, and is
// replaced, when its process is gone OR it is older than the longest run the watchdog allows (a hung/reused PID).
const LOCK_MAX_AGE_MS = 2 * 3600 * 1000;
function acquireLock(cfg) {
  const p = init(cfg);
  const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.writeFileSync(p.lock, payload, { flag: 'wx', mode: 0o640 }); return true; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let cur = null; try { cur = JSON.parse(fs.readFileSync(p.lock, 'utf8')); } catch (e) { /* unreadable lock is treated as stale */ }
    const age = cur && cur.at ? Date.now() - Date.parse(cur.at) : Infinity;
    let alive = false;
    if (cur && cur.pid) { try { process.kill(cur.pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; } }
    if (alive && age < LOCK_MAX_AGE_MS) return false;
    try { fs.unlinkSync(p.lock); } catch (e) { /* someone else reclaimed it first; the next wx decides */ }
  }
  return false;
}
function releaseLock(cfg) { try { fs.unlinkSync(paths(cfg).lock); } catch (e) { /* ignore */ } }

function audit(cfg, runId, event, data) {
  const p = init(cfg);
  const now = new Date();
  const file = path.join(p.auditDir, `audit-${now.toISOString().slice(0, 7)}.jsonl`);
  const line = redact(JSON.stringify(Object.assign({ ts: now.toISOString(), run: runId, event }, data || {})));
  fs.appendFileSync(file, line + '\n', { mode: 0o640 });
}

function readAudit(cfg, limit) {
  const p = paths(cfg);
  let files = []; try { files = fs.readdirSync(p.auditDir).filter((f) => /^audit-.*\.jsonl$/.test(f)).sort(); } catch (e) { return []; }
  const lines = [];
  for (const f of files.slice(-3)) lines.push(...fs.readFileSync(path.join(p.auditDir, f), 'utf8').split('\n').filter(Boolean));
  return lines.slice(-(limit || 50)).map((l) => { try { return JSON.parse(l); } catch (e) { return { raw: l }; } });
}

// ---- run ledger: one JSON line per run (id, times, checks, actions, errors, final status) + last-run.json for monitoring
function recordRun(cfg, entry) {
  const p = init(cfg);
  const line = redact(JSON.stringify(entry));
  fs.appendFileSync(p.ledger, line + '\n', { mode: 0o640 });
  if (!entry.dryRun) writeJson(p.lastRun, JSON.parse(line)); // a manual dry run must never mask a failed scheduled run
}
function readLedger(cfg, limit) {
  const p = paths(cfg); let lines = [];
  try { lines = fs.readFileSync(p.ledger, 'utf8').split('\n').filter(Boolean); } catch (e) { return []; }
  return lines.slice(-(limit || 50)).map((l) => { try { return JSON.parse(l); } catch (e) { return { raw: l }; } });
}
function trimLedger(cfg, keep) {
  const p = paths(cfg); let lines = [];
  try { lines = fs.readFileSync(p.ledger, 'utf8').split('\n').filter(Boolean); } catch (e) { return 0; }
  if (lines.length <= keep) return 0;
  const tmp = `${p.ledger}.${process.pid}.tmp`; fs.writeFileSync(tmp, lines.slice(-keep).join('\n') + '\n', { mode: 0o640 }); fs.renameSync(tmp, p.ledger);
  return lines.length - keep;
}

// ---- edit limits (max pages per day, per-page cooldown, new-page window)
const COUNTED = ['proposed', 'applied'];
function appliedOn(st, date) { return st.history.filter((h) => COUNTED.includes(h.status) && h.date === date); }
function limitStatus(cfg, st, date) {
  const todayPages = new Set(appliedOn(st, date).map((h) => h.page));
  return { pagesToday: todayPages.size, remainingToday: Math.max(0, cfg.limits.pagesPerDay - todayPages.size) };
}
function onCooldown(cfg, st, page, date) {
  const last = st.history.filter((h) => COUNTED.includes(h.status) && h.page === page).map((h) => h.date).sort().pop();
  return last && daysBetween(last, date) < cfg.limits.cooldownDays ? { last, until: addDays(last, cfg.limits.cooldownDays) } : null;
}
function newPageAllowed(cfg, st, date) { return !st.lastNewPageAt || daysBetween(st.lastNewPageAt, date) >= 7; }

// ---- retention: drop reports, snapshots, cache and audit files older than the retention window (min 90 days)
function rotate(cfg, dateStr) {
  const p = paths(cfg); const cutoff = addDays(dateStr || today(), -cfg.retentionDays); let removed = 0;
  for (const dir of [p.reports, p.snapshots, p.cache, p.auditDir]) {
    let names = []; try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (const n of names) {
      const m = n.match(/(\d{4}-\d{2}(?:-\d{2})?)/); if (!m) continue;
      const d = m[1].length === 7 ? m[1] + '-28' : m[1];
      if (d < cutoff) { try { fs.unlinkSync(path.join(dir, n)); removed++; } catch (e) { /* ignore */ } }
    }
  }
  removed += trimLedger(cfg, Math.max(400, cfg.retentionDays * 3));
  return removed;
}

module.exports = { LOCK_MAX_AGE_MS, recordRun, readLedger, trimLedger, paths, init, load, save, loadLastmod, saveLastmod, isDisabled, setEnabled, acquireLock, releaseLock, audit, readAudit, limitStatus, onCooldown, newPageAllowed, rotate, appliedOn };
