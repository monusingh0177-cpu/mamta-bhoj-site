'use strict';
const { execFileSync, spawnSync } = require('child_process');

const GIT_ENV = (extra) => Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'Mamta SEO Autopilot', GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'autopilot@localhost', GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'Mamta SEO Autopilot', GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'autopilot@localhost' }, extra || {});
function git(cwd, args, opts) {
  try { const out = execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV(), stdio: ['ignore', 'pipe', 'pipe'], timeout: (opts && opts.timeoutMs) || 60000 }); return opts && opts.raw ? out : out.trim(); }
  catch (e) { const err = new Error(`git ${args.join(' ')} failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`); err.status = e.status; throw err; }
}
const head = (cwd) => git(cwd, ['rev-parse', 'HEAD']);
const branch = (cwd) => git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
// [{status, file}] for tracked changes and untracked files
function dirty(cwd) { return git(cwd, ['status', '--porcelain', '--untracked-files=all'], { raw: true }).split('\n').filter(Boolean).map((l) => ({ status: l.slice(0, 2).trim() || '??', file: l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop() })); }
function run(cmd, cwd, timeoutMs) { const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', timeout: timeoutMs || 120000 }); return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() }; }
module.exports = { git, head, branch, dirty, run };
