'use strict';
// Proposal branches. A patch is never applied to the production working tree: it is applied in a separate git
// worktree (outside the repository folder) on a new branch "seo-autopilot/<date>-<page>-<id>", validated there,
// and committed ONLY to that branch. Merging, pushing, deploying and restarting stay manual.
const fs = require('fs');
const path = require('path');
const { git } = require('./git');

const PREFIX = 'seo-autopilot/';
const slug = (s) => String(s).replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'home';

function create(cfg, { date, page, id }) {
  const branch = `${PREFIX}${date}-${slug(page)}-${id}`;
  const dir = path.join(cfg.stateDir, 'worktrees', branch.replace('/', '__'));
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(cfg.repoDir, ['worktree', 'add', '-q', '-b', branch, dir, 'HEAD']);
  const nm = path.join(cfg.repoDir, 'node_modules');
  if (fs.existsSync(nm) && !fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(nm, path.join(dir, 'node_modules'));
  return { branch, dir };
}

function commit(wt, files, message) {
  git(wt.dir, ['add', '--', ...files]);
  git(wt.dir, ['commit', '-q', '-m', message]);
  return git(wt.dir, ['rev-parse', 'HEAD']);
}

// Remove the worktree and (optionally) the branch. Never touches the production branch.
function remove(cfg, wt, deleteBranch) {
  try { git(cfg.repoDir, ['worktree', 'remove', '--force', wt.dir]); } catch (e) { try { fs.rmSync(wt.dir, { recursive: true, force: true }); git(cfg.repoDir, ['worktree', 'prune']); } catch (e2) { /* ignore */ } }
  if (deleteBranch) { try { git(cfg.repoDir, ['branch', '-D', wt.branch]); } catch (e) { /* already gone */ } }
}

const list = (cfg) => git(cfg.repoDir, ['branch', '--list', `${PREFIX}*`, '--format=%(refname:short)']).split('\n').filter(Boolean);
const isMerged = (cfg, branch) => git(cfg.repoDir, ['branch', '--merged', 'HEAD', '--list', branch]).trim() !== '';
const exists = (cfg, branch) => list(cfg).includes(branch);
const diffStat = (cfg, branch) => git(cfg.repoDir, ['diff', '--stat', `HEAD...${branch}`]);

module.exports = { PREFIX, create, commit, remove, list, isMerged, exists, diffStat, slug };
