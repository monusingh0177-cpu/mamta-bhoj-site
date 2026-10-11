'use strict';
// Persistent state (outside the web root): state.json, history, hashes, lastmod map, enabled flag, run lock,
// and the append-only audit log (one JSON object per line, monthly files).
const fs = require('fs');
const path = require('path');
const { ensureDir, readJson, writeJson, today, redact, addDays, daysBetween } = require('./util');

function paths(cfg) {
  const d = cfg.stateDir;
  return { dir: d, state: path.join(d, 'state.json'), lastmod: path.join(d, 'lastmod.json'), disabled: path.join(d, 'DISABLED'), lock: path.join(d, 'run.lock'),
    reports: path.join(d, 'reports'), snapshots: path.join(d, 'snapshots'), cache: path.join(d, 'cache'), auditDir: path.join(d, 'audit'), indexnowState: path.join(d, 'indexnow-state.json'), indexnowLog: path.join(d, 'indexnow.log') };
}

function init(cfg) {
  const p = paths(cfg);
  [p.dir, p.reports, p.snapshots, p.cache, p.auditDir].forEach((x) => ensureDir(x));
  return p;
}

const EMPTY = () => ({ version: 1, initialAuditDone: false, createdAt: new Date().toISOString(), hashes: {}, pageCount: null, history: [], inspections: {}, lastRun: null, lastNewPageAt: null });

function load(cfg) { return Object.assign(EMPTY(), readJson(paths(cfg).state, {})); }
function save(cfg, st) { writeJson(paths(cfg).state, st); }

function loadLastmod(cfg) { return readJson(paths(cfg).lastmod, {}); }
function saveLastmod(cfg, m) { writeJson(paths(cfg).lastmod, m); }

const isDisabled = (cfg) => fs.existsSync(paths(cfg).disabled);
function setEnabled(cfg, on) {
  const p = init(cfg);
  if (on) { try { fs.unlinkSync(p.disabled); } catch (e) { /* already enabled */ } } else fs.writeFileSync(p.disabled, `disabled ${new Date().toISOString()}\n`);
}

// Single-run lock; a lock whose process is gone is stale and is replaced.
function acquireLock(cfg) {
  const p = init(cfg);
  try {
    const cur = JSON.parse(fs.readFileSync(p.lock, 'utf8'));
    let alive = false; try { process.kill(cur.pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
    if (alive) return false;
  } catch (e) { /* no lock or unreadable */ }
  fs.writeFileSync(p.lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  return true;
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
  return removed;
}

module.exports = { paths, init, load, save, loadLastmod, saveLastmod, isDisabled, setEnabled, acquireLock, releaseLock, audit, readAudit, limitStatus, onCooldown, newPageAllowed, rotate, appliedOn };
