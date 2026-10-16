#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-deploy-guard.js   (npm run test:deploy-guard)
//
// Tests the protected-path guard of scripts/deploy-production.sh. It extracts the script's own PROTECTED_RE and runs the
// SAME pipeline the script uses (git diff --name-only PREV TARGET | grep -E "$PROTECTED_RE") in disposable git repos.
// Nothing is deployed, no network, the real repository is only read.
// =============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0; let failed = 0;
const check = (c, name, detail) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${name}${c || !detail ? '' : '  -> ' + String(detail).slice(0, 260)}`); };

const script = fs.readFileSync(path.join(ROOT, 'scripts/deploy-production.sh'), 'utf8').replace(/\r\n/g, '\n');
const m = script.match(/^PROTECTED_RE='([^']+)'$/m);
if (!m) { console.log('  FAIL  PROTECTED_RE not found in deploy-production.sh'); process.exit(1); }
const RE = m[1];
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }) }).trim();

// the guard exactly as the script runs it: returns { rc, hits } where rc!=0 means "git itself failed" (must fail closed)
function guard(cwd, prev, target) {
  const sh = 'set -euo pipefail; changed="$(git diff --name-only "$1" "$2" --)"; printf "%s\\n" "$changed" | grep -E "$3" || true';
  const r = spawnSync('bash', ['-c', sh, 'guard', prev, target, RE], { cwd, encoding: 'utf8' });
  return { rc: r.status, hits: r.stdout.split('\n').filter(Boolean) };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dguard-'));
try {
  console.log('\n== protected-path guard');
  g(tmp, 'init', '-q', '-b', 'main');
  const put = (f, c) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), c); };
  const commit = (msg, files) => { for (const [f, c] of Object.entries(files)) put(f, c); g(tmp, 'add', '-A'); g(tmp, 'commit', '-q', '-m', msg); return g(tmp, 'rev-parse', 'HEAD'); };
  const base = commit('base', { 'data/admin.json': '{}', 'public/uploads/a.txt': 'a', 'lib/mailer.js': 'm', 'lib/auth.js': 'a', 'lib/session.js': 's', 'lib/store.js': 's', 'lib/persist-paths.js': 'p', 'lib/admin-render.js': 'x', 'routes/admin.js': 'r', 'middleware/x.js': 'm', 'views/admin-x.js': 'v', 'public/js/admin.js': 'j', 'public/css/admin.css': 'c', '.env.example': 'e', 'views/guides.js': 'g', 'autopilot/lib/ai.js': 'a', 'docs/seo-autopilot.md': 'd', 'scripts/test-x.js': 't', 'lib/crm-forward.js': 'c', 'lib/enquiry.js': 'e' });

  // allowed: only SEO/autopilot source, tests and docs change -> the guard finds nothing and (empty output) must NOT count as protected
  const ok1 = commit('seo + autopilot + docs + tests', { 'views/guides.js': 'g2', 'autopilot/lib/ai.js': 'a2', 'docs/seo-autopilot.md': 'd2', 'scripts/test-x.js': 't2', 'lib/crm-forward.js': 'c2', 'lib/enquiry.js': 'e2' });
  let r = guard(tmp, base, ok1);
  check(r.rc === 0 && r.hits.length === 0, 'a commit changing only SEO/autopilot source, tests and docs has NO protected files (empty result is never a hit)', JSON.stringify(r));

  // each protected path is blocked and named
  const prot = ['data/admin.json', 'public/uploads/a.txt', 'lib/mailer.js', 'lib/auth.js', 'lib/session.js', 'lib/store.js', 'lib/persist-paths.js', 'lib/admin-render.js', 'routes/admin.js', 'middleware/x.js', 'views/admin-x.js', 'public/js/admin.js', 'public/css/admin.css', '.env.example'];
  let prev = ok1;
  for (const f of prot) { const t = commit('touch ' + f, { [f]: 'changed-' + f }); r = guard(tmp, prev, t); check(r.rc === 0 && r.hits.join() === f, `a change to ${f} is blocked and the exact filename is reported`, JSON.stringify(r)); prev = t; }

  // mixed commit: only the protected file is listed
  const mixed = commit('mixed', { 'views/guides.js': 'g3', 'lib/mailer.js': 'm3', 'docs/seo-autopilot.md': 'd3' });
  r = guard(tmp, prev, mixed); check(r.hits.join() === 'lib/mailer.js', 'in a mixed commit only the protected file is listed', JSON.stringify(r));

  // fail closed: a comparison that git cannot make is an error, never "no protected changes"
  r = guard(tmp, '0000000000000000000000000000000000000000', mixed); check(r.rc !== 0 && r.hits.length === 0, 'a git comparison that fails (unknown commit) fails the guard step (non-zero) instead of passing', JSON.stringify(r));

  // the script wiring: protected changes stop a deploy unless the explicit flag is given; both guard sites use the same variable
  check(/grep -E "\$PROTECTED_RE" \|\| true/.test(script) && /grep -E "\$PROT" \|\| true/.test(script), 'the local preview and the server-side script both apply PROTECTED_RE');
  check(/this deploy would change PROTECTED files[^\n]*Nothing was changed/.test(script) && /\[ "\$ALLOW_PROTECTED" -eq 1 \] && warn/.test(script), 'a deploy with protected changes dies before touching anything unless --allow-protected-changes is given explicitly');

  // the real scenario from production: 8cb8c48 -> cac70ad changed lib/mailer.js (contact e-mail field), pathspec "lib/mailer" does NOT match lib/mailer.js
  let have = true; try { g(ROOT, 'cat-file', '-e', '8cb8c48^{commit}'); g(ROOT, 'cat-file', '-e', 'cac70ad^{commit}'); } catch (e) { have = false; }
  if (!have) console.log('  SKIP  real 8cb8c48 -> cac70ad scenario  -> those commits are not in this clone (shallow CI checkout)');
  else {
    r = guard(ROOT, '8cb8c48', 'cac70ad');
    check(r.rc === 0 && r.hits.join() === 'lib/mailer.js', 'real range 8cb8c48 -> cac70ad: the guard blocks, and the only protected file is lib/mailer.js', JSON.stringify(r));
    const ps = execFileSync('git', ['diff', '--name-only', '8cb8c48', 'cac70ad', '--', 'lib/mailer'], { cwd: ROOT, encoding: 'utf8' }).trim();
    check(ps === '', 'a git pathspec "lib/mailer" (a directory prefix) does not match lib/mailer.js, which is why a hand-written diff showed nothing');
    check(guard(ROOT, 'cac70ad', 'cac70ad').hits.length === 0, 'no protected change between identical commits');
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nDEPLOY GUARD TESTS ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
