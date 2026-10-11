'use strict';
// IndexNow: the key already deployed with the site is discovered from lib/indexnow.js and checked against the
// live /<key>.txt file. It is never replaced. Submission reuses scripts/indexnow-submit.js (which re-verifies
// the key and only accepts canonical sitemap URLs). IndexNow is a change notification, not a ranking or indexing guarantee.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { request } = require('./util');

function discoverKey(repoDir) {
  const src = fs.readFileSync(path.join(repoDir, 'lib/indexnow.js'), 'utf8');
  const m = src.match(/INDEXNOW_KEY\s*=\s*'([A-Za-z0-9-]{8,128})'/);
  if (!m) throw new Error('IndexNow key not found in lib/indexnow.js');
  return m[1];
}

async function verify(cfg) {
  try {
    const key = discoverKey(cfg.repoDir);
    const r = await request(`${cfg.fetchBase}/${key}.txt`);
    return r.status === 200 && r.body.trim() === key ? { ok: true, detail: `key file served at ${cfg.fetchBase}/${key}.txt` } : { ok: false, detail: `key file at /${key}.txt returned HTTP ${r.status} or a different body` };
  } catch (e) { return { ok: false, detail: e.message }; }
}

function submit(cfg, urlPaths, files) {
  const out = [];
  for (let i = 0; i < urlPaths.length; i += 100) {
    const batch = urlPaths.slice(i, i + 100);
    const r = spawnSync(process.execPath, [path.join(cfg.repoDir, 'scripts/indexnow-submit.js'), '--urls', batch.join(','), '--submit', '--sitemap', `${cfg.fetchBase}/sitemap.xml`, '--fetch-base', cfg.fetchBase, '--endpoint', cfg.indexnowEndpoint, '--state', files.indexnowState, '--log', files.indexnowLog], { encoding: 'utf8', timeout: 180000 });
    const text = (r.stdout || '') + (r.stderr || '');
    const resp = (text.match(/IndexNow response: HTTP (\d+)/) || [])[1];
    out.push({ urls: batch, ok: r.status === 0 && /^(200|202)$/.test(resp || ''), http: resp ? +resp : null, detail: r.status === 0 ? 'accepted' : text.split('\n').filter((l) => /ERROR|HTTP/.test(l)).slice(0, 2).join(' | ') });
  }
  return out;
}

module.exports = { discoverKey, verify, submit };
