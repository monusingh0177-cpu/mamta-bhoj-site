#!/usr/bin/env bash
# =============================================================================
# scripts/seo-health-check.sh  -  read-only SEO health check for Mamta Bhoj
#
# Fetches the sitemap and every page in it, plus robots.txt, redirects and a
# set of "should not be exposed" URLs, and verifies the SEO rules this project
# depends on (canonicals, titles/descriptions, H1, schema, internal links,
# claims safety, address consistency, no exposed files ...).
#
# It only sends GET/HEAD requests. It never writes to the site, the repo, or
# any data. Needs: bash, node >= 18 (already required by the project). No npm
# packages.
#
# Exit codes:   0 = all checks passed (warnings allowed)
#               1 = one or more checks FAILED
#               2 = usage error / prerequisite missing / site unreachable
#
# Examples:
#   scripts/seo-health-check.sh                       # production site
#   scripts/seo-health-check.sh --local               # http://localhost:3000
#   scripts/seo-health-check.sh --base-url http://127.0.0.1:3111 --skip-links
#   scripts/seo-health-check.sh --help
# =============================================================================
set -u -o pipefail

PROD_ORIGIN="https://devmamflourishfoods.com"
BASE_URL="$PROD_ORIGIN"
EXPECTED_ORIGIN="$PROD_ORIGIN"
SKIP_LINKS=0
VERBOSE=0
EXPECT_URLS=""
TIMEOUT=15
NO_COLOR_FLAG=0

usage() {
  cat <<'EOF'
Usage: scripts/seo-health-check.sh [options]

Read-only SEO health check. Only sends GET/HEAD requests.

Target:
  --base-url URL         Site to check (default: https://devmamflourishfoods.com)
  --local [PORT]         Shortcut for --base-url http://localhost:PORT (default 3000)
  --expected-origin URL  Canonical origin pages must declare
                         (default: https://devmamflourishfoods.com). Keep the
                         default when checking a local or staging copy: the
                         canonical URLs must always point at production.

Options:
  --expect-urls N        Fail unless the sitemap lists exactly N URLs
  --skip-links           Skip the (slower) internal link / asset check
  --timeout SECONDS      Per-request timeout (default: 15)
  --verbose              Print every passing check, not just a count
  --no-color             Disable ANSI colours
  -h, --help             Show this help

Exit codes: 0 = pass (warnings allowed), 1 = failures found, 2 = usage /
prerequisite / unreachable-site error.
EOF
}

die_usage() { echo "ERROR: $*" >&2; echo "Try: scripts/seo-health-check.sh --help" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --base-url)        [ $# -ge 2 ] || die_usage "--base-url needs a value"; BASE_URL="$2"; shift 2 ;;
    --local)           if [ $# -ge 2 ] && [[ "$2" =~ ^[0-9]+$ ]]; then BASE_URL="http://localhost:$2"; shift 2; else BASE_URL="http://localhost:3000"; shift; fi ;;
    --expected-origin) [ $# -ge 2 ] || die_usage "--expected-origin needs a value"; EXPECTED_ORIGIN="$2"; shift 2 ;;
    --expect-urls)     [ $# -ge 2 ] || die_usage "--expect-urls needs a value"; EXPECT_URLS="$2"; shift 2 ;;
    --timeout)         [ $# -ge 2 ] || die_usage "--timeout needs a value"; TIMEOUT="$2"; shift 2 ;;
    --skip-links)      SKIP_LINKS=1; shift ;;
    --verbose|-v)      VERBOSE=1; shift ;;
    --no-color)        NO_COLOR_FLAG=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *)                 die_usage "unknown option: $1" ;;
  esac
done

[[ "$BASE_URL" =~ ^https?://[^/[:space:]]+(/)?$ ]] || die_usage "--base-url must look like http(s)://host[:port] (got: $BASE_URL)"
[[ "$EXPECTED_ORIGIN" =~ ^https?://[^/[:space:]]+(/)?$ ]] || die_usage "--expected-origin must look like https://host (got: $EXPECTED_ORIGIN)"
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] && [ "$TIMEOUT" -ge 1 ] || die_usage "--timeout must be a positive integer"
if [ -n "$EXPECT_URLS" ]; then [[ "$EXPECT_URLS" =~ ^[0-9]+$ ]] || die_usage "--expect-urls must be a number"; fi

command -v node >/dev/null 2>&1 || { echo "ERROR: node is required (>= 18)." >&2; exit 2; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "${NODE_MAJOR:-0}" -ge 18 ] || { echo "ERROR: node >= 18 required (found $(node --version))." >&2; exit 2; }

COLOR=0
if [ -t 1 ] && [ "$NO_COLOR_FLAG" -eq 0 ] && [ -z "${NO_COLOR:-}" ]; then COLOR=1; fi

export HC_BASE_URL="${BASE_URL%/}" HC_EXPECTED_ORIGIN="${EXPECTED_ORIGIN%/}" HC_TIMEOUT="$TIMEOUT" \
       HC_SKIP_LINKS="$SKIP_LINKS" HC_VERBOSE="$VERBOSE" HC_EXPECT_URLS="$EXPECT_URLS" HC_COLOR="$COLOR"

# -----------------------------------------------------------------------------
# The checks themselves: a self-contained Node program (standard library only).
# Site-specific rules (address, known redirects, banned claims) are in CFG.
# -----------------------------------------------------------------------------
node - <<'NODE'
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = process.env.HC_BASE_URL;
const EXP = process.env.HC_EXPECTED_ORIGIN;
const TIMEOUT = Number(process.env.HC_TIMEOUT) * 1000;
const SKIP_LINKS = process.env.HC_SKIP_LINKS === '1';
const VERBOSE = process.env.HC_VERBOSE === '1';
const EXPECT_URLS = process.env.HC_EXPECT_URLS ? Number(process.env.HC_EXPECT_URLS) : null;
const COLOR = process.env.HC_COLOR === '1';
const UA = 'MamtaBhoj-SEO-HealthCheck/1.0 (read-only)';
const MAX_BODY = 6 * 1024 * 1024;

// ------------------------- site-specific rules (edit here) --------------------
const CFG = {
  address: 'Gata No. 402, Village Malau, Chaubepur, Tehsil Bilhaur, Kanpur Nagar, Uttar Pradesh – 209203',
  bannedAddress: /NH34/i,
  // [from, to]: GET `from` must 301 to EXP + `to`
  redirects: [['/products/chakki-atta', '/products/fresh-chakki-atta']],
  // must never be reachable (any 200 is a failure)
  notExposed: ['/.env', '/.git/config', '/.gitignore', '/data/admin.json', '/data/products.json', '/data/content.json',
    '/data/enquiries.json', '/package.json', '/package-lock.json', '/server.js', '/lib/mailer.js', '/lib/store.js',
    '/routes/admin.js', '/views/home.js', '/README.md', '/CLAUDE.md', '/render.yaml', '/scripts/deploy-production.sh',
    '/scripts/seo-health-check.sh', '/docs/image-notes/hero-README.md', '/source-assets/mamta-bhoj-logo.png',
    '/images/hero/README.md', '/images/../data/admin.json', '/images/%2e%2e/data/admin.json', '/css/../server.js'],
  claimPatterns: [
    ['no Delhi / NCR / Ghaziabad / Noida / Gurgaon presence claims', /\b(delhi|ncr|ghaziabad|noida|gurgaon|gurugram)\b/i],
    ['no "fresh for longer" claim', /fresh for longer/i],
    ['no "lab verified / tested" claim (no report is published)', /lab[- ]?(verified|tested|certified)/i],
    ['no prices (₹, Rs, INR)', /₹|\bRs\.?\s?\d|\bINR\b/],
    ['no "nationwide / distribution network / dealer network" claim', /\b(nationwide|distribution network|dealer network)\b/i],
  ],
  forbiddenSchemaKeys: ['offers', 'price', 'priceCurrency', 'aggregateRating', 'review', 'reviewRating', 'ratingValue',
    'ratingCount', 'availability', 'sku', 'gtin', 'gtin13', 'mpn', 'areaServed', 'openingHours', 'geo'],
};

// ------------------------- tiny helpers ---------------------------------------
const results = [];
let section = '';
const rec = (level, name, detail) => results.push({ section, level, name, detail: detail || '' });
const pass = (n, d) => rec('PASS', n, d);
const fail = (n, d) => rec('FAIL', n, d);
const warn = (n, d) => rec('WARN', n, d);
const skip = (n, d) => rec('SKIP', n, d);
const expect = (cond, name, detail, level) => (cond ? pass(name) : rec(level || 'FAIL', name, detail));
const unesc = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const visible = (html) => unesc(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attrs = (tag) => { const o = {}; tag.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k.toLowerCase()] = v; return m; }); return o; };
const tags = (html, name) => (html.match(new RegExp('<' + name + '\\b[^>]*>', 'gi')) || []).map(attrs);
const pathOf = (loc) => { try { const u = new URL(loc); return u.pathname + u.search; } catch (e) { return loc; } };

function request(urlStr, opts = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return resolve({ error: 'bad-url' }); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || undefined,
      path: opts.rawPath || (u.pathname + u.search), method: opts.method || 'GET', agent: false, timeout: opts.timeout || TIMEOUT,
      headers: Object.assign({ 'User-Agent': UA, Accept: '*/*', Connection: 'close' }, opts.headers || {}),
    }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.end();
  });
}
async function pool(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const locOk = (loc, expectedPath) => loc === EXP + expectedPath || loc === expectedPath;

// ------------------------------- main -----------------------------------------
(async () => {
  const baseU = new URL(BASE); const expU = new URL(EXP);
  const isProd = baseU.host === expU.host;
  console.log(`SEO health check\n  target          : ${BASE}\n  expected origin : ${EXP}\n  mode            : ${isProd ? 'production-style (infrastructure checks ON)' : 'local/staging (infrastructure checks skipped)'}`);

  // ---- robots.txt (also the reachability probe)
  section = 'robots.txt';
  const robots = await request(BASE + '/robots.txt');
  if (robots.error) { console.error(`\nERROR: cannot reach ${BASE} (${robots.error}). Nothing was checked.`); process.exit(2); }
  expect(robots.status === 200, 'GET /robots.txt returns 200', 'status ' + robots.status);
  expect(/text\/plain/i.test(robots.headers['content-type'] || ''), 'robots.txt content-type is text/plain', robots.headers['content-type'], 'WARN');
  const rl = robots.body.split(/\r?\n/).map((l) => l.trim());
  expect(rl.some((l) => /^user-agent:\s*\*$/i.test(l)), 'has "User-agent: *"');
  expect(rl.includes('Sitemap: ' + EXP + '/sitemap.xml'), 'declares Sitemap: ' + EXP + '/sitemap.xml');
  expect(rl.some((l) => /^disallow:\s*\/admin\s*$/i.test(l)), 'blocks /admin');
  expect(!rl.some((l) => /^disallow:\s*\/\s*$/i.test(l)), 'does not block the whole site');
  const otherDis = rl.filter((l) => /^disallow:/i.test(l) && !/^disallow:\s*\/admin\s*$/i.test(l) && !/^disallow:\s*$/i.test(l));
  expect(!otherDis.some((l) => /\/(css|js|images|uploads|documents)\b/i.test(l)), 'does not block CSS / JS / images / uploads', otherDis.join(' | '));
  expect(otherDis.length === 0, 'no unexpected Disallow rules', otherDis.join(' | '), 'WARN');

  // ---- sitemap
  section = 'sitemap.xml';
  const sm = await request(BASE + '/sitemap.xml');
  expect(sm.status === 200, 'GET /sitemap.xml returns 200', 'status ' + sm.status);
  expect(/xml/i.test(sm.headers['content-type'] || ''), 'sitemap content-type is XML', sm.headers['content-type'], 'WARN');
  expect(/<urlset[\s>]/.test(sm.body || '') && /<\/urlset>/.test(sm.body || ''), 'valid <urlset> document');
  const locs = [...(sm.body || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => unesc(m[1]));
  expect(locs.length > 0, 'sitemap lists URLs', 'found ' + locs.length);
  expect(new Set(locs).size === locs.length, 'no duplicate URLs', locs.filter((l, i) => locs.indexOf(l) !== i).join(', '));
  expect(locs.every((l) => l.startsWith(EXP + '/') || l === EXP), 'every URL is on the canonical origin ' + EXP, locs.filter((l) => !l.startsWith(EXP)).join(', '));
  expect(!locs.some((l) => /^http:\/\//.test(l) || /\/\/www\./.test(l)), 'no http:// or www URLs');
  if (EXPECT_URLS !== null) expect(locs.length === EXPECT_URLS, `sitemap lists exactly ${EXPECT_URLS} URLs`, 'found ' + locs.length);
  else pass(`sitemap lists ${locs.length} URLs`);

  // ---- fetch every page
  const pages = await pool(locs, 6, async (loc) => {
    const p = loc.startsWith(EXP) ? (loc.slice(EXP.length) || '/') : pathOf(loc);
    const r = await request(BASE + p);
    return { loc, path: p, r };
  });

  // ---- per-page checks
  section = 'Pages (' + pages.length + ')';
  const meta = []; const linkSet = new Set(); const linkSrc = new Map();
  for (const { loc, path: p, r } of pages) {
    const tag = (s) => `${p} :: ${s}`;
    if (r.error || r.status !== 200) { fail(tag('returns 200 (no redirect, no error)'), r.error || 'status ' + r.status); continue; }
    pass(tag('returns 200'));
    const html = r.body;
    expect(/text\/html/i.test(r.headers['content-type'] || ''), tag('content-type text/html'), r.headers['content-type'], 'WARN');
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    const metas = tags(html, 'meta');
    const m = (key, val) => (metas.find((x) => x[key] === val) || {}).content;
    const desc = m('name', 'description');
    const canon = tags(html, 'link').filter((l) => (l.rel || '').toLowerCase() === 'canonical').map((l) => l.href);
    const wantCanon = EXP + (p === '/' ? '/' : p.split('?')[0]);
    const h1s = html.match(/<h1[\s>][\s\S]*?<\/h1>/gi) || [];
    expect(!!title, tag('has <title>'));
    expect(title.length > 0 && title.length <= 70, tag('title <= 70 chars'), title.length + ' chars: ' + unesc(title), 'WARN');
    expect(!!desc, tag('has meta description'));
    expect(!desc || (desc.length >= 50 && desc.length <= 160), tag('description 50-160 chars'), desc ? desc.length + ' chars' : '', 'WARN');
    expect(canon.length === 1, tag('exactly one canonical'), 'found ' + canon.length);
    expect(canon[0] === wantCanon, tag('canonical == ' + wantCanon), 'got ' + canon[0]);
    expect(!metas.some((x) => x.name === 'robots' && /noindex/i.test(x.content || '')) && !/noindex/i.test(r.headers['x-robots-tag'] || ''), tag('indexable (no noindex meta/header)'));
    expect(h1s.length === 1, tag('exactly one <h1>'), 'found ' + h1s.length);
    expect(!!m('property', 'og:title') && !!m('property', 'og:description') && !!m('property', 'og:image') && !!m('property', 'og:type'), tag('Open Graph title/description/image/type present'));
    expect(m('property', 'og:url') === wantCanon, tag('og:url == canonical'), 'got ' + m('property', 'og:url'));
    expect(!!m('name', 'twitter:card'), tag('Twitter card present'));
    expect(!!m('name', 'viewport') && /<html[^>]+\blang=/i.test(html), tag('viewport meta and <html lang> present'));
    const imgs = tags(html, 'img');
    const badAlt = imgs.filter((i) => !('alt' in i) || !String(i.alt).trim());
    expect(badAlt.length === 0, tag('every <img> has non-empty alt'), badAlt.map((i) => i.src).join(', '));
    const text = visible(html);
    expect(text.includes(CFG.address), tag('shows the authoritative address'), 'address text not found');
    expect(!CFG.bannedAddress.test(text), tag('no old "NH34" address'));
    // JSON-LD
    const ldRaw = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    const ld = []; let ldOk = true;
    for (const raw of ldRaw) { try { ld.push(JSON.parse(raw)); } catch (e) { ldOk = false; } }
    expect(ldOk, tag('all JSON-LD blocks are valid JSON'));
    const keys = new Set(); const defined = new Set(); const refs = new Set();
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object') {
        Object.keys(o).forEach((k) => { keys.add(k); walk(o[k]); });
        if (o['@id']) (Object.keys(o).length === 1 ? refs : defined).add(o['@id']);
      }
    })(ld);
    const badKeys = CFG.forbiddenSchemaKeys.filter((k) => keys.has(k));
    expect(badKeys.length === 0, tag('schema has no offers/price/rating/review/etc.'), badKeys.join(', '));
    const unresolved = [...refs].filter((x) => !defined.has(x));
    expect(unresolved.length === 0, tag('no unresolved @id references in schema'), unresolved.join(', '));
    for (const node of ld) {
      if (node['@type'] === 'FAQPage') {
        const miss = (node.mainEntity || []).filter((q) => !text.includes(unesc(q.name)) || !text.includes(unesc((q.acceptedAnswer || {}).text || '')));
        expect(miss.length === 0, tag('every FAQPage question + answer is visible on the page'), miss.map((q) => q.name).join(' | '));
      }
      if (node['@type'] === 'Organization' && node.address) {
        const a = node.address; const joined = `${a.streetAddress}, ${a.addressLocality}, ${a.addressRegion} – ${a.postalCode}`;
        expect(joined === CFG.address, tag('Organization schema address matches the authoritative address'), joined);
      }
    }
    // claims
    const claimText = text + ' ' + ldRaw.join(' ');
    for (const [label, rx] of CFG.claimPatterns) expect(!rx.test(claimText), tag(label), (claimText.match(rx) || [''])[0]);
    const kgText = text.replace(/1 kg, 2 kg and 5 kg/g, '').replace(/1 kg, 2 kg & 5 kg/g, '');
    expect(!/\b5 ?kg\b/i.test(kgText), tag('pack sizes only ever stated as "1 kg, 2 kg and 5 kg"'), (kgText.match(/.{20}\b5 ?kg\b.{10}/i) || [''])[0]);
    const badHP = (html.match(/<div class="product-card[\s\S]*?<\/div>\s*<\/div>/g) || []).filter((c) => /high protein/i.test(c) && !/<h3>Fresh Chakki Atta<\/h3>/.test(c));
    expect(badHP.length === 0, tag('"High Protein" only on Fresh Chakki Atta cards'));
    const words = (visible((html.match(/<main[\s\S]*?<\/main>/) || [''])[0]).match(/\w+/g) || []).length;
    expect(words >= 120, tag('main content is not thin (>= 120 words)'), words + ' words', 'WARN');
    // collect links
    const found = [];
    tags(html, 'a').forEach((a) => a.href && found.push(a.href));
    tags(html, 'img').forEach((i) => i.src && found.push(i.src));
    tags(html, 'script').forEach((s) => s.src && found.push(s.src));
    tags(html, 'link').forEach((l) => l.href && !/canonical/i.test(l.rel || '') && found.push(l.href));
    const internal = found.filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0]).filter(Boolean);
    internal.forEach((h) => { linkSet.add(h); if (!linkSrc.has(h)) linkSrc.set(h, new Set()); linkSrc.get(h).add(p); });
    meta.push({ path: p, title: unesc(title), desc: unesc(desc || ''), canon: canon[0], h1: unesc((h1s[0] || '').replace(/<[^>]+>/g, '')).trim(), hrefs: new Set(internal.map((h) => h.split('?')[0].replace(/\/$/, '') || '/')) });
  }

  // ---- site-wide consistency
  section = 'Site-wide consistency';
  const dup = (arr) => arr.filter((v, i) => v && arr.indexOf(v) !== i);
  expect(dup(meta.map((x) => x.title)).length === 0, 'all page titles are unique', dup(meta.map((x) => x.title)).join(' | '));
  expect(dup(meta.map((x) => x.desc)).length === 0, 'all meta descriptions are unique', dup(meta.map((x) => x.desc)).join(' | '));
  expect(dup(meta.map((x) => x.canon)).length === 0, 'no two pages share a canonical', dup(meta.map((x) => x.canon)).join(' | '));
  expect(dup(meta.map((x) => x.h1)).length === 0, 'H1 text is unique per page', dup(meta.map((x) => x.h1)).join(' | '), 'WARN');
  const inbound = new Map(meta.map((x) => [x.path, 0]));
  meta.forEach((a) => a.hrefs.forEach((h) => { if (h !== a.path && inbound.has(h)) inbound.set(h, inbound.get(h) + 1); }));
  const orphans = [...inbound].filter(([, n]) => n === 0).map(([p]) => p);
  const weak = [...inbound].filter(([p, n]) => n > 0 && n < 3).map(([p, n]) => `${p}(${n})`);
  expect(orphans.length === 0, 'no orphan pages (every sitemap URL is linked from another page)', orphans.join(', '));
  expect(weak.length === 0, 'every page has >= 3 inbound internal links', weak.join(', '), 'WARN');

  // ---- redirects, status codes and special URLs
  section = 'Redirects, status codes, crawl rules';
  const wwwHost = 'www.' + expU.host;
  if (isProd) {
    const w = await request('https://' + wwwHost + '/');
    expect(!w.error && [301, 308].includes(w.status) && locOk(w.headers.location, '/'), 'https://' + wwwHost + '/ -> 301 to ' + EXP + '/', w.error || `${w.status} ${w.headers && w.headers.location}`);
    if (expU.protocol === 'https:') {
      const h = await request('http://' + expU.host + '/');
      expect(!h.error && [301, 308].includes(h.status) && /^https:\/\//.test(h.headers.location || ''), 'http://' + expU.host + '/ -> 301 to https', h.error || `${h.status} ${h.headers && h.headers.location}`);
      const hw = await request('http://' + wwwHost + '/');
      expect(!hw.error && [301, 308].includes(hw.status), 'http://' + wwwHost + '/ -> 301 (to https)', hw.error || `${hw.status} ${hw.headers && hw.headers.location}`);
    }
  } else {
    const w = await request(BASE + '/', { headers: { Host: wwwHost } });
    expect(!w.error && [301, 308].includes(w.status) && locOk(w.headers.location, '/'), 'Host: ' + wwwHost + ' -> 301 to ' + EXP + '/ (app-level www redirect)', w.error || `${w.status} ${w.headers && w.headers.location}`);
    const w2 = await request(BASE + '/products/maida?utm=x', { headers: { Host: wwwHost } });
    expect(!w2.error && [301, 308].includes(w2.status) && locOk(w2.headers.location, '/products/maida?utm=x'), 'www redirect preserves path and query', w2.error || (w2.headers && w2.headers.location));
    skip('http -> https and www DNS redirects', 'production-only (proxy/DNS level); run against the live site');
  }
  for (const [from, to] of CFG.redirects) {
    const r = await request(BASE + from);
    expect(!r.error && r.status === 301 && locOk(r.headers.location, to), `${from} -> 301 to ${to}`, r.error || `${r.status} ${r.headers && r.headers.location}`);
  }
  const ts = await request(BASE + '/about/');
  expect(!ts.error && ts.status === 301 && /^(https?:\/\/[^/]+)?\/about$/.test(ts.headers.location || ''), 'trailing slash /about/ -> 301 /about', ts.error || `${ts.status} ${ts.headers && ts.headers.location}`);
  const nf = await request(BASE + '/this-page-should-not-exist-' + Date.now());
  expect(!nf.error && nf.status === 404, 'unknown URL returns 404 (not a soft 200)', nf.error || 'status ' + nf.status);
  expect(!nf.error && (/noindex/i.test(nf.body || '') || /noindex/i.test(nf.headers['x-robots-tag'] || '')), '404 page is noindex');
  const ad = await request(BASE + '/admin');
  expect(!ad.error && ad.status === 302 && /noindex/i.test(ad.headers['x-robots-tag'] || ''), '/admin redirects to login with X-Robots-Tag: noindex', ad.error || `${ad.status} ${ad.headers && ad.headers['x-robots-tag']}`);
  const al = await request(BASE + '/admin/login');
  expect(!al.error && al.status === 200 && (/noindex/i.test(al.headers['x-robots-tag'] || '') && /<meta name="robots" content="noindex/i.test(al.body)), '/admin/login is noindex (header + meta)');
  const hd = await request(BASE + '/', { method: 'HEAD' });
  expect(!hd.error && hd.status === 200 && hd.body === '', 'HEAD / returns 200 with an empty body', hd.error || `${hd.status} body=${(hd.body || '').length}`);
  if (isProd) {
    const home = await request(BASE + '/', { headers: { 'Accept-Encoding': 'gzip, br' } });
    expect(!!home.headers['content-encoding'], 'responses are compressed (gzip/br)', 'no Content-Encoding header', 'WARN');
    expect(!!home.headers['strict-transport-security'], 'HSTS header present', 'missing Strict-Transport-Security', 'WARN');
  } else skip('compression and HSTS', 'production-only (usually set by the reverse proxy)');

  // ---- files that must never be reachable
  section = 'Exposure (must NOT be reachable)';
  await pool(CFG.notExposed, 6, async (p) => {
    const r = await request(BASE + p, { rawPath: p });
    expect(!r.error && r.status !== 200, `${p} is not served`, r.error || `HTTP ${r.status}`);
  });

  // ---- internal links and assets
  section = 'Internal links and assets';
  if (SKIP_LINKS) skip('internal link / asset check', 'skipped with --skip-links');
  else {
    const urls = [...linkSet];
    let ok = 0; let redirects = []; let bad = [];
    await pool(urls, 8, async (u) => {
      const r = await request(BASE + u);
      if (r.error) bad.push(`${u} (${r.error}) <- ${[...linkSrc.get(u)][0]}`);
      else if (r.status === 200) ok++;
      else if (r.status >= 300 && r.status < 400) redirects.push(`${u} -> ${r.status} <- ${[...linkSrc.get(u)][0]}`);
      else bad.push(`${u} (HTTP ${r.status}) <- ${[...linkSrc.get(u)][0]}`);
    });
    expect(bad.length === 0, `no broken internal links/assets (${urls.length} unique checked)`, bad.slice(0, 8).join('; '));
    expect(redirects.length === 0, 'internal links point at final URLs (no redirect hops)', redirects.slice(0, 6).join('; '), 'WARN');
  }

  // ------------------------------- report -------------------------------------
  const c = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
  const paint = { PASS: (s) => c(32, s), FAIL: (s) => c(31, s), WARN: (s) => c(33, s), SKIP: (s) => c(36, s) };
  const order = []; results.forEach((r) => { if (!order.includes(r.section)) order.push(r.section); });
  for (const s of order) {
    console.log(`\n== ${s}`);
    let np = 0;
    for (const r of results.filter((x) => x.section === s)) {
      if (r.level === 'PASS') { np++; if (!VERBOSE) continue; }
      console.log(`  ${paint[r.level](r.level.padEnd(4))}  ${r.name}${r.detail ? '  -> ' + r.detail : ''}`);
    }
    console.log(`  ${np} check(s) passed${VERBOSE ? '' : ' (use --verbose to list them)'}`);
  }
  const n = (l) => results.filter((r) => r.level === l).length;
  console.log(`\nRESULT: ${n('PASS')} passed, ${n('WARN')} warning(s), ${n('FAIL')} FAILED, ${n('SKIP')} skipped  (${results.length} checks, ${pages.length} pages)`);
  console.log(n('FAIL') === 0 ? paint.PASS('SEO HEALTH CHECK: PASS') : paint.FAIL('SEO HEALTH CHECK: FAIL'));
  process.exit(n('FAIL') === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR: unexpected failure: ' + (e && e.stack || e)); process.exit(2); });
NODE
