'use strict';
// Explicit, evidence-based activation of automatic publishing.
//
// AUTOPILOT_MODE=auto alone does NOTHING: publishing also needs an activation record, which only
//     node autopilot/cli.js activate-auto
// can create, and only after every readiness check passed on this server, as the unprivileged service user. The record is bound
// to the repository path, the release branch and the exact restart command, so changing any of them silently de-activates
// publishing until activate-auto is run (and passes) again. `deactivate-auto` removes it. Nothing here publishes or restarts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { git, head, branch, dirty } = require('./git');
const publishLib = require('./publish');
const { readJson, writeJson } = require('./util');

const RUNTIME_DATA = /^(data\/|public\/uploads\/)/;
const file = (cfg) => path.join(cfg.stateDir, 'auto-activation.json');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const binding = (cfg) => ({ repoDir: cfg.repoDir, remote: cfg.auto.remote, branch: cfg.auto.branch, restartCmdHash: hash(cfg.auto.restartCmd) });

// Is there a valid activation for the CURRENT configuration? -> { ok, reason, record }
function status(cfg) {
  const rec = readJson(file(cfg), null);
  if (!rec) return { ok: false, reason: 'automatic publishing has not been activated: run node autopilot/cli.js activate-auto (it checks that everything works first)' };
  const b = binding(cfg);
  for (const k of Object.keys(b)) if (rec.binding && rec.binding[k] !== b[k]) return { ok: false, reason: `the activation no longer matches the configuration (${k} changed): run node autopilot/cli.js activate-auto again`, record: rec };
  if (!rec.binding) return { ok: false, reason: 'the activation record is unreadable: run node autopilot/cli.js activate-auto again', record: rec };
  return { ok: true, reason: '', record: rec };
}

// Read-only readiness checks. `opts.testRestart` additionally runs the restart command once (a real, brief restart: explicit opt-in).
// -> { ok, checks: [{ name, ok, detail }] }
async function readiness(cfg, opts) {
  const o = opts || {}; const checks = []; const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail || '').slice(0, 300) });
  const mis = publishLib.misconfigured(cfg); add('configuration', !mis, mis || 'restart command, remote and branch are set');
  const uid = typeof process.getuid === 'function' ? process.getuid() : null; add('least-privilege', uid !== 0, uid === 0 ? 'running as root: run the autopilot as its unprivileged service user' : `running as ${os.userInfo().username}${uid == null ? ' (uid not available on this platform)' : ''}`);
  let onBranch = false;
  try { onBranch = branch(cfg.repoDir) === cfg.auto.branch; add('release-branch', onBranch, onBranch ? `on ${cfg.auto.branch}` : `on "${branch(cfg.repoDir)}", not "${cfg.auto.branch}"`); } catch (e) { add('release-branch', false, e.message); }
  try { const d = dirty(cfg.repoDir).filter((x) => !RUNTIME_DATA.test(x.file)); add('clean-tree', d.length === 0, d.length ? `modified: ${d.slice(0, 4).map((x) => x.file).join(', ')}` : 'tracked files clean (data/ and uploads are ignored)'); } catch (e) { add('clean-tree', false, e.message); }
  try { git(cfg.repoDir, ['fetch', '--quiet', cfg.auto.remote, cfg.auto.branch], { timeoutMs: cfg.auto.pushTimeoutMs }); const rh = git(cfg.repoDir, ['rev-parse', 'FETCH_HEAD']); add('at-remote-release', rh === head(cfg.repoDir), rh === head(cfg.repoDir) ? `HEAD == ${cfg.auto.remote}/${cfg.auto.branch} (${rh.slice(0, 8)})` : `HEAD ${head(cfg.repoDir).slice(0, 8)} differs from ${cfg.auto.remote}/${cfg.auto.branch} ${rh.slice(0, 8)}`); } catch (e) { add('at-remote-release', false, `cannot fetch ${cfg.auto.remote}: ${e.message}`); }
  try { git(cfg.repoDir, ['push', '--dry-run', '--quiet', cfg.auto.remote, `HEAD:refs/heads/${cfg.auto.branch}`], { timeoutMs: cfg.auto.pushTimeoutMs }); add('push-access', true, `git push --dry-run to ${cfg.auto.remote} ${cfg.auto.branch} was accepted (nothing was pushed)`); } catch (e) { add('push-access', false, `${e.message}. A deploy key with write access (and branch-protection that allows it) is required`); }
  const w = (p) => { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch (e) { return false; } };
  const need = [path.join(cfg.repoDir, 'views'), path.join(cfg.repoDir, '.git'), cfg.stateDir]; const bad = need.filter((p) => !w(p));
  add('write-access', bad.length === 0, bad.length ? `not writable by this user: ${bad.join(', ')}` : 'views/, .git and the state directory are writable');
  const protectedWritable = ['data', 'public/uploads', 'lib', 'routes', 'middleware'].filter((d) => fs.existsSync(path.join(cfg.repoDir, d)) && w(path.join(cfg.repoDir, d)));
  // informational: on a typical server the owner can write everywhere; the systemd unit is what keeps the rest read-only
  add('protected-paths-note', true, protectedWritable.length ? `writable by this user (restricted at runtime by the systemd unit and the protected-path guard): ${protectedWritable.join(', ')}` : 'protected directories are read-only for this user');
  const first = String(cfg.auto.restartCmd || '').trim().split(/\s+/)[0];
  if (first) { const r = require('child_process').spawnSync('bash', ['-c', `command -v ${first.replace(/[^A-Za-z0-9._\/-]/g, '')}`], { encoding: 'utf8' }); add('restart-command-found', r.status === 0, r.status === 0 ? `${first} found` : `${first} was not found on PATH for this user`); }
  if (o.testRestart) { const r = publishLib.restart(cfg); add('restart-test', r.ok, r.detail); }
  try { const sm = await require('./gates').smoke(cfg, []); add('live-smoke', sm.ok, sm.ok ? 'the live site passes the public smoke test' : sm.results.filter((x) => !x.ok).map((x) => x.name).join(', ')); } catch (e) { add('live-smoke', false, e.message); }
  return { ok: checks.every((c) => c.ok), checks };
}

async function activate(cfg, opts) {
  const r = await readiness(cfg, opts);
  if (!r.ok) return Object.assign({ activated: false }, r);
  const rec = { at: new Date().toISOString(), user: os.userInfo().username, head: head(cfg.repoDir), binding: binding(cfg), checks: r.checks, restartTested: Boolean(opts && opts.testRestart) };
  writeJson(file(cfg), rec);
  return { activated: true, ok: true, checks: r.checks, record: rec };
}

function deactivate(cfg) { try { fs.unlinkSync(file(cfg)); return true; } catch (e) { return false; } }

module.exports = { status, readiness, activate, deactivate, binding };
