#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/indexnow-submit.js   (npm run seo:indexnow)
//
// Tells IndexNow-participating search engines (Bing, Yandex, Seznam, Naver, ...) which
// canonical URLs are new or changed. It has no effect on Google Search, and it is not
// a ranking tool: submit when content really changed, not on a schedule.
//
//   node scripts/indexnow-submit.js                       # DRY RUN: lists what would be sent
//   node scripts/indexnow-submit.js --submit              # send every sitemap URL once
//   node scripts/indexnow-submit.js --only-changed --submit   # only pages whose HTML differs from the last submission
//   node scripts/indexnow-submit.js --since <git-ref> --submit # only pages affected by files changed since <git-ref>
//   node scripts/indexnow-submit.js --urls /about,/guides/how-to-store-flour --submit
//
// Safety rules enforced here:
//   * URLs come from the live sitemap (canonical, absolute, https, on the site host) or an
//     explicit --urls list that is checked against that sitemap; nothing else is accepted;
//   * nothing is sent without --submit; a batch never exceeds 10,000 URLs;
//   * the ownership key is public by design (lib/indexnow.js) and is verified to be served
//     at https://<host>/<key>.txt before anything is submitted;
//   * results are logged without any secret (there are none); --log FILE appends to a 0600 file;
//   * with --only-changed the last-submitted page fingerprints are kept in a state file so
//     unchanged pages are not submitted again.
// Options: --sitemap URL  --fetch-base URL (read pages from here, e.g. a local copy)
//          --endpoint URL (default https://api.indexnow.org/indexnow)  --state FILE  --log FILE
// =============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const { INDEXNOW_KEY, INDEXNOW_KEY_PATH } = require(path.join(REPO, 'lib/indexnow.js'));
const { SITE_ORIGIN } = require(path.join(REPO, 'lib/seo.js'));
const HOST = new URL(SITE_ORIGIN).host;

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
if (flag('-h') || flag('--help')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 29).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }

const SUBMIT = flag('--submit');
const ONLY_CHANGED = flag('--only-changed');
const SINCE = opt('--since', '');
const URLS = opt('--urls', '');
const SITEMAP = opt('--sitemap', `${SITE_ORIGIN}/sitemap.xml`);
const FETCH_BASE = opt('--fetch-base', '').replace(/\/$/, '');
const ENDPOINT = opt('--endpoint', 'https://api.indexnow.org/indexnow');
const STATE = opt('--state', path.join(os.homedir(), '.cache', 'mamta-bhoj', 'indexnow-state.json'));
const LOG = opt('--log', '');

const say = (m) => { console.log(m); if (LOG) { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`, { mode: 0o600 }); } };
const die = (m, code) => { console.error('ERROR: ' + m); process.exit(code || 1); };

function request(urlStr, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers, timeout: 20000 }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Which canonical paths a changed source file can affect (used by --since).
function affectedPaths(files, allPaths) {
  const sitewide = /^(lib\/(render|seo|business|picture|image-dims)\.js|views\/links\.js|public\/(css|js)\/|server\.js)/;
  const set = new Set();
  for (const f of files) {
    if (sitewide.test(f)) return allPaths.slice();
    if (/^views\/guides/.test(f)) allPaths.filter((p) => p === '/guides' || p.startsWith('/guides/')).forEach((p) => set.add(p));
    else if (/^views\/(b2b|b2b-pages)\.js$/.test(f)) allPaths.filter((p) => /flour-manufacturer|supplier|supply-distribution/.test(p)).forEach((p) => set.add(p));
    else if (/^views\/product|^data\/products\.json|^views\/products\.js/.test(f)) allPaths.filter((p) => p.startsWith('/products')).forEach((p) => set.add(p));
    else if (/^views\/home\.js/.test(f)) set.add('/');
    else if (/^views\/about\.js/.test(f)) set.add('/about');
    else if (/^views\/quality\.js/.test(f)) set.add('/quality');
    else if (/^views\/faq\.js/.test(f)) set.add('/faq');
    else if (/^views\/contact\.js/.test(f)) set.add('/contact');
    else if (/^views\/certifications\.js/.test(f)) set.add('/certifications');
    else if (/^public\/images\//.test(f)) allPaths.forEach((p) => set.add(p)); // an image may be used anywhere
    else if (/^data\/content\.json/.test(f)) allPaths.forEach((p) => set.add(p));
  }
  return allPaths.filter((p) => set.has(p));
}

(async () => {
  say(`IndexNow ${SUBMIT ? 'SUBMIT' : 'DRY RUN'} for ${HOST}`);
  const sm = await request(SITEMAP).catch((e) => die(`cannot read the sitemap ${SITEMAP}: ${e.message}`, 2));
  if (sm.status !== 200) die(`sitemap ${SITEMAP} returned HTTP ${sm.status}`, 2);
  const locs = [...sm.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const bad = locs.filter((l) => { try { const u = new URL(l); return u.protocol !== 'https:' || u.host !== HOST || u.search || u.hash; } catch (e) { return true; } });
  if (bad.length) die(`the sitemap contains URLs that are not canonical https://${HOST} URLs: ${bad.slice(0, 3).join(', ')}`, 2);
  if (!locs.length) die('the sitemap lists no URLs', 2);
  const pathOf = (l) => new URL(l).pathname;
  const allPaths = locs.map(pathOf);

  // the ownership key must be live before anything is submitted
  const keyUrl = `${FETCH_BASE || SITE_ORIGIN}${INDEXNOW_KEY_PATH}`;
  const kr = await request(keyUrl).catch((e) => ({ status: 0, body: e.message }));
  if (kr.status !== 200 || kr.body.trim() !== INDEXNOW_KEY) {
    if (SUBMIT) die(`the key file ${keyUrl} is not live (HTTP ${kr.status}); deploy the site first, then submit`, 2);
    say(`WARNING: key file ${keyUrl} is not live yet (HTTP ${kr.status}); a real submission would be refused until the site is deployed`);
  } else say(`key file verified at ${keyUrl}`);

  let chosen = allPaths.slice();
  if (URLS) {
    chosen = URLS.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (x.startsWith('http') ? pathOf(x) : x));
    const unknown = chosen.filter((p) => !allPaths.includes(p));
    if (unknown.length) die(`not canonical sitemap URLs: ${unknown.join(', ')}`);
  } else if (SINCE) {
    let files;
    try { files = execFileSync('git', ['diff', '--name-only', SINCE, 'HEAD'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { die(`git diff against ${SINCE} failed: ${e.message}`); }
    chosen = affectedPaths(files, allPaths);
    say(`${files.length} files changed since ${SINCE} -> ${chosen.length} affected URLs`);
  }

  const fingerprints = {};
  if (ONLY_CHANGED || SUBMIT) {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { state = {}; }
    const unchanged = [];
    for (const p of chosen) {
      const r = await request(`${FETCH_BASE || SITE_ORIGIN}${p}`).catch(() => null);
      if (!r || r.status !== 200) die(`${p} did not return 200 (${r ? r.status : 'no response'}); not submitting a URL that is not live`);
      fingerprints[p] = crypto.createHash('sha256').update(r.body).digest('hex');
      if (ONLY_CHANGED && state[p] === fingerprints[p]) unchanged.push(p);
    }
    if (ONLY_CHANGED) { chosen = chosen.filter((p) => !unchanged.includes(p)); say(`${unchanged.length} pages unchanged since the last submission are skipped`); }
  }

  const urlList = chosen.map((p) => `${SITE_ORIGIN}${p === '/' ? '/' : p}`);
  say(`${urlList.length} URL(s) selected:`);
  urlList.forEach((u) => say(`  ${u}`));
  if (!urlList.length) { say('nothing to submit'); return; }
  if (urlList.length > 10000) die('more than 10,000 URLs; split the batch');
  if (!SUBMIT) { say('DRY RUN: nothing was sent. Add --submit to send these URLs.'); return; }

  const payload = JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE_ORIGIN}${INDEXNOW_KEY_PATH}`, urlList });
  const res = await request(ENDPOINT, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) } }).catch((e) => die(`request to ${ENDPOINT} failed: ${e.message}`));
  say(`IndexNow response: HTTP ${res.status}${res.body ? ' ' + res.body.slice(0, 200) : ''}`);
  const meaning = { 200: 'accepted', 202: 'accepted (key validation pending)', 400: 'bad request', 403: 'key not valid or not found at keyLocation', 422: 'URLs do not belong to the host or key mismatch', 429: 'too many requests' };
  say(`meaning: ${meaning[res.status] || 'unexpected status'}`);
  if (res.status === 200 || res.status === 202) {
    try {
      let state = {}; try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { state = {}; }
      Object.assign(state, fingerprints); fs.mkdirSync(path.dirname(STATE), { recursive: true });
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1), { mode: 0o600 });
    } catch (e) { say(`note: could not save the state file (${e.message}); unchanged pages may be resubmitted next time`); }
    return;
  }
  process.exit(1);
})().catch((e) => die(e.message));
