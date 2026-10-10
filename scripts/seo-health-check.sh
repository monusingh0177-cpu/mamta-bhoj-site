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
HARD=0
MATRIX=0

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
  --hard                 Add the strict checks: link-graph discovery crawl, schema audit, duplicate
                         content heuristics, performance smoke, security headers, IndexNow key, claims
  --matrix               Print the per-URL indexability matrix (implies nothing else; use with --hard)
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
    --hard)            HARD=1; shift ;;
    --matrix)          MATRIX=1; shift ;;
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
       HC_SKIP_LINKS="$SKIP_LINKS" HC_HARD="$HARD" HC_MATRIX="$MATRIX" HC_VERBOSE="$VERBOSE" HC_EXPECT_URLS="$EXPECT_URLS" HC_COLOR="$COLOR"

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
const HARD = process.env.HC_HARD === '1';
const MATRIX = process.env.HC_MATRIX === '1';
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
    ['no "lab tested / certified" claim (no report or certificate is published)', /lab[- ]?(tested|certified)/i],
    ['no prices (₹, Rs, INR)', /₹|\bRs\.?\s?\d|\bINR\b/],
    ['no "nationwide / distribution network / dealer network" claim', /\b(nationwide|distribution network|dealer network)\b/i],
  ],
  // Owner-confirmed: ONLY the Fresh Chakki Atta fibre-and-protein claim is lab verified (no certificate,
  // lab name or figures are published). "lab verified" may appear on these pages and only in a sentence about it.
  labVerifiedPages: ['/products/fresh-chakki-atta', '/flour-manufacturer-india'],
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
  const meta = []; const store = []; const linkSet = new Set(); const linkSrc = new Map();
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
    expect(title.length > 0 && unesc(title).length <= 60, tag('title <= 60 chars (SERP width)'), unesc(title).length + ' chars: ' + unesc(title), 'WARN');
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
    const noDims = imgs.filter((i) => !i.width || !i.height);
    expect(noDims.length === 0, tag('every <img> has width and height (no layout shift)'), noDims.map((i) => i.src).join(', ').slice(0, 160));
    const levels = (html.match(/<h([1-6])[\s>]/gi) || []).map((x) => +x[2]);
    const jumped = levels.find((l, i) => i > 0 && l > levels[i - 1] + 1);
    expect(!jumped, tag('heading levels do not skip (h1>h2>h3)'), jumped ? 'jumps to h' + jumped : '', 'WARN');
    const text = visible(html);
    expect(text.includes(CFG.address), tag('shows the authoritative address'), 'address text not found');
    expect(!CFG.bannedAddress.test(text), tag('no old "NH34" address'));
    // JSON-LD
    const ldRaw = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    const ld = []; let ldOk = true;
    for (const raw of ldRaw) { try { ld.push(JSON.parse(raw)); } catch (e) { ldOk = false; } }
    const nodesOf = (o) => (o && o['@graph'] ? o['@graph'] : [o]).filter(Boolean);
    const ldNodes = [].concat(...ld.map(nodesOf));
    const typesOf = (n) => [].concat(n['@type'] || []);
    expect(ldOk, tag('all JSON-LD blocks are valid JSON'));
    const keys = new Set(); const defined = new Set(); const refs = new Set();
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object') {
        Object.keys(o).forEach((k) => { keys.add(k); walk(o[k]); });
        if (o['@id']) (Object.keys(o).length === 1 ? refs : defined).add(o['@id']);
      }
    })(ld);
    if (p !== '/') {
      expect(ldNodes.some((n) => typesOf(n).includes('BreadcrumbList')), tag('has BreadcrumbList schema'));
      expect(/<nav[^>]+class="breadcrumb"/i.test(html), tag('has a visible breadcrumb'), '', 'WARN');
    }
    const badKeys = CFG.forbiddenSchemaKeys.filter((k) => keys.has(k));
    expect(badKeys.length === 0, tag('schema has no offers/price/rating/review/etc.'), badKeys.join(', '));
    const unresolved = [...refs].filter((x) => !defined.has(x));
    expect(unresolved.length === 0, tag('no unresolved @id references in schema'), unresolved.join(', '));
    expect(!ldNodes.some((n) => typesOf(n).includes('FAQPage') || typesOf(n).includes('QAPage')), tag('no FAQPage/QAPage markup (FAQ rich results are retired; FAQs stay as visible HTML)'));
    for (const node of ldNodes) {
      if (typesOf(node).includes('Organization') && node.address) {
        const a = node.address; const joined = `${a.streetAddress}, ${a.addressLocality}, ${a.addressRegion} – ${a.postalCode}`;
        expect(joined === CFG.address, tag('Organization schema address matches the authoritative address'), joined);
      }
    }
    // claims
    const claimText = text + ' ' + ldRaw.join(' ');
    for (const [label, rx] of CFG.claimPatterns) expect(!rx.test(claimText), tag(label), (claimText.match(rx) || [''])[0]);
    const lv = claimText.match(/[^.!?]*lab[- ]?verified[^.!?]*/gi) || [];
    if (CFG.labVerifiedPages.includes(p.split('?')[0])) {
      const stray = lv.filter((x) => !/fibre|protein/i.test(x));
      expect(stray.length === 0, tag('"lab verified" only appears about the Chakki Atta fibre and protein claim'), stray.join(' | ').slice(0, 120));
    } else expect(lv.length === 0, tag('no "lab verified" claim (only allowed about Chakki Atta on its own page)'), lv.join(' | ').slice(0, 120));
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
    const mainHtml = (html.match(/<main[\s\S]*?<\/main>/i) || [''])[0];
    const mainHrefs = new Set(tags(mainHtml, 'a').map((a) => (a.href || '').split('#')[0].split('?')[0].replace(/\/$/, '')).filter((h) => h.startsWith('/')));
    const allLinks = tags(html, 'a').map((a) => a.href || '').filter(Boolean);
    const mainAnchors = [...mainHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: ((attrs('<a ' + m[1] + '>').href) || '').split('#')[0].split('?')[0].replace(/\/$/, ''), text: unesc(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() })).filter((a) => a.href.startsWith('/'));
    store.push({ p, status: r.status, headers: r.headers, html, text, ldNodes, title: unesc(title), desc: unesc(desc || ''), canon: canon[0], h1: unesc((h1s[0] || '').replace(/<[^>]+>/g, '')).trim(), h1Count: h1s.length, metaRobots: (metas.find((x) => x.name === 'robots') || {}).content || '', allLinks, mainAnchors });
    meta.push({ mainHrefs, path: p, title: unesc(title), desc: unesc(desc || ''), canon: canon[0], h1: unesc((h1s[0] || '').replace(/<[^>]+>/g, '')).trim(), hrefs: new Set(internal.map((h) => h.split('?')[0].replace(/\/$/, '') || '/')) });
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

  // ---- hub-and-spoke linking: contextual links inside <main>, not just the header/footer
  const B2B_SET = ['/flour-manufacturer-india', '/bulk-flour-supplier-india', '/wholesale-flour-supplier', '/institutional-flour-supplier', '/supply-distribution-india'];
  const MFR = '/flour-manufacturer-kanpur';
  const has = (x, pred) => [...x.mainHrefs].some(pred);
  const isProduct = (h) => /^\/products\/[^/]+$/.test(h); const isGuide = (h) => /^\/guides\/[^/]+$/.test(h);
  const lacks = (list, pred) => list.filter((x) => !pred(x)).map((x) => x.path).join(', ');
  const prods = meta.filter((x) => isProduct(x.path)); const guides = meta.filter((x) => isGuide(x.path));
  const b2bPages = meta.filter((x) => B2B_SET.includes(x.path) || x.path === MFR);
  const home = meta.find((x) => x.path === '/');
  if (home) expect(['/products', MFR, '/flour-manufacturer-india', '/guides', '/contact'].every((h) => home.mainHrefs.has(h)), 'home page body links to products, both manufacturer pages, guides and enquiry', ['/products', MFR, '/flour-manufacturer-india', '/guides', '/contact'].filter((h) => !home.mainHrefs.has(h)).join(', '));
  expect(lacks(prods, (x) => has(x, isGuide) && has(x, (h) => B2B_SET.includes(h)) && x.mainHrefs.has(MFR)) === '', 'product pages link to a guide, a B2B page and the manufacturer page in their body', lacks(prods, (x) => has(x, isGuide) && has(x, (h) => B2B_SET.includes(h)) && x.mainHrefs.has(MFR)));
  expect(lacks(guides, (x) => has(x, isProduct) && has(x, (h) => B2B_SET.includes(h)) && x.mainHrefs.has(MFR)) === '', 'guides link to a product, a B2B page and the manufacturer page in their body', lacks(guides, (x) => has(x, isProduct) && has(x, (h) => B2B_SET.includes(h)) && x.mainHrefs.has(MFR)));
  expect(lacks(b2bPages, (x) => has(x, isProduct) && (x.path === MFR || x.mainHrefs.has(MFR)) && x.mainHrefs.has('/contact')) === '', 'B2B and manufacturer pages link to products, the manufacturer page and the enquiry form in their body', lacks(b2bPages, (x) => has(x, isProduct) && (x.path === MFR || x.mainHrefs.has(MFR)) && x.mainHrefs.has('/contact')));

  // ======================= HARD MODE (--hard): strict, site-wide checks =======================
  if (HARD) {
    const origin = new URL(EXP).origin;
    const inSitemap = new Set(pages.map((x) => x.path));
    const plain = (h) => (h || '').split('#')[0];
    const cleanPath = (h) => { const q = plain(h).split('?')[0]; return q.length > 1 ? q.replace(/\/+$/, '') : q; };
    const isIndexable = (rec) => !/noindex/i.test((rec.metaRobots || '') + ' ' + (rec.headers['x-robots-tag'] || ''));
    // main text minus shared template blocks (product cards, call-to-action band, link lists, process/why grids)
    const SHARED = /class="(product-grid|cta-band|guide-links|guide-grid|journey-section|why-grid|promo-strip)/;
    const mainTextOf = (html) => visible(((html.match(/<main[\s\S]*?<\/main>/i) || [''])[0]).split(/(?=<section\b)/).filter((blk) => !SHARED.test(blk)).join(' '));

    // ---- A. link-graph discovery: every internal page reachable by <a href> is accounted for
    section = 'Hard: discovery crawl and indexability';
    const known = new Map(store.map((r) => [r.p, r]));
    const queue = []; const seenQ = new Set(store.map((r) => r.p)); const discovered = []; const paramVariants = new Set();
    for (const r of store) for (const h of r.allLinks) {
      if (!h.startsWith('/') || h.startsWith('//')) continue;
      const base = cleanPath(h); if (plain(h).includes('?')) paramVariants.add(plain(h));
      if (/^\/(css|js|images|documents|uploads)\//.test(base) || /\.(png|jpe?g|webp|ico|svg|pdf|txt|xml)$/i.test(base) || base === '' ) continue;
      if (!seenQ.has(base)) { seenQ.add(base); queue.push(base); }
    }
    const crawled = await pool(queue, 6, async (p) => ({ p, r: await request(BASE + p) }));
    const offSitemap = [];
    for (const { p, r } of crawled) {
      if (r.error) { fail(`link target ${p} is reachable`, r.error); continue; }
      if (p.startsWith('/admin')) continue;
      discovered.push([p, r.status]);
      if (r.status === 200 && /text\/html/i.test(r.headers['content-type'] || '') && !/noindex/i.test(r.body.slice(0, 4000)) && !/noindex/i.test(r.headers['x-robots-tag'] || '')) offSitemap.push(p);
      else if (r.status >= 400) fail(`internal link target ${p} returns ${r.status}`, '');
      else if (r.status >= 300) warn(`internal link target ${p} redirects (${r.status} -> ${r.headers.location})`, 'link straight to the final URL');
    }
    expect(offSitemap.length === 0, 'every indexable page found by crawling links is in the sitemap', offSitemap.join(', '));
    pass(`link crawl: ${store.length} sitemap pages + ${crawled.length} other internal link targets examined`);
    // query-string variants must never be a second indexable copy
    const paramBad = []; let paramN = 0;
    for (const v of [...paramVariants].slice(0, 60)) {
      const path0 = v.split('?')[0]; if (path0.startsWith('/admin') || /\.(png|jpe?g|webp|css|js)$/.test(path0)) continue;
      const r = await request(BASE + v); paramN++;
      if (r.error || r.status !== 200) continue;
      const canon = (/<link rel="canonical" href="([^"]+)"/i.exec(r.body) || [])[1];
      const noidx = /<meta name="robots" content="[^"]*noindex/i.test(r.body);
      if (!noidx && canon !== EXP + (path0 === '/' ? '/' : path0)) paramBad.push(`${v} canonical=${canon}`);
    }
    expect(paramBad.length === 0, `query-string URLs (${paramN} variants linked on the site) canonicalise to the clean URL or are noindex`, paramBad.slice(0, 4).join('; '));
    for (const q of ['?sent=1', '?error=1', '?nl=sent']) {
      const r = await request(BASE + '/contact' + q);
      expect(!r.error && /<meta name="robots" content="[^"]*noindex/i.test(r.body) && !/rel="canonical"/.test(r.body), `/contact${q} (a status view) is noindex and has no canonical`, r.error || '');
    }
    const sm0 = await request(BASE + '/sitemap.xml');
    expect(!/<lastmod>/.test(sm0.body) || [...sm0.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((m) => !isNaN(Date.parse(m[1])) && Date.parse(m[1]) <= Date.now() + 864e5), 'sitemap lastmod values (if any) are valid dates and not in the future');
    if (!/<lastmod>/.test(sm0.body)) pass('sitemap has no lastmod: none is emitted because no verifiable per-URL modification date exists');
    const llms = await request(BASE + '/llms.txt');
    expect(!llms.error && llms.status === 404, 'no /llms.txt (not used by Google Search; deliberately absent)', llms.error || 'status ' + llms.status);
    const robotsTxt = (await request(BASE + '/robots.txt')).body || '';
    const dis = robotsTxt.split(/\r?\n/).filter((l) => /^disallow:\s*\S/i.test(l)).map((l) => l.replace(/^disallow:\s*/i, '').trim());
    expect(!pages.some((x) => dis.some((d) => x.path.startsWith(d))), 'no sitemap URL is blocked by a robots.txt Disallow rule', dis.join(', '));

    // ---- B. structured data audit
    section = 'Hard: structured data';
    const BAD_TYPES = ['FAQPage', 'QAPage', 'HowTo', 'LocalBusiness', 'Review', 'AggregateRating', 'Offer', 'AggregateOffer', 'JobPosting', 'Recipe', 'Event', 'SpeakableSpecification'];
    let sameAsFound = []; const logoUrls = new Set(); const sdProblems = [];
    for (const r of store) {
      const types = [].concat(...r.ldNodes.map((n) => [].concat(n['@type'] || [])));
      const count = (t) => types.filter((x) => x === t).length;
      const bad = types.filter((t) => BAD_TYPES.includes(t));
      if (bad.length) sdProblems.push(`${r.p}: ${bad.join(',')}`);
      if (JSON.stringify(r.ldNodes).includes('SearchAction')) sdProblems.push(`${r.p}: SearchAction`);
      if (count('Organization') !== 1 || count('WebSite') !== 1) sdProblems.push(`${r.p}: needs exactly one Organization and one WebSite (${count('Organization')}/${count('WebSite')})`);
      const wp = r.ldNodes.filter((n) => [].concat(n['@type']).some((t) => /^(WebPage|AboutPage|ContactPage|CollectionPage|ItemPage)$/.test(t)));
      if (wp.length !== 1) sdProblems.push(`${r.p}: needs exactly one WebPage-type node (${wp.length})`);
      else {
        if (wp[0]['@id'] !== EXP + (r.p === '/' ? '/' : r.p) + '#webpage' && wp[0]['@id'] !== EXP + r.p + '#webpage') sdProblems.push(`${r.p}: WebPage @id is ${wp[0]['@id']}`);
        if (wp[0].url !== EXP + (r.p === '/' ? '/' : r.p)) sdProblems.push(`${r.p}: WebPage url is ${wp[0].url}`);
      }
      const isProductPage = /^\/products\/[^/]+$/.test(r.p); const isGuide = /^\/guides\/[^/]+$/.test(r.p);
      // Product is deliberately absent everywhere: Google requires offers, review or aggregateRating for Product
      // snippets and none may be invented (enquiry-only site). A bare Product block shows up as Invalid in Search Console.
      if (count('Product') !== 0) sdProblems.push(`${r.p}: Product nodes = ${count('Product')} (must be 0: no offers/review/aggregateRating exist)`);
      { const flat = JSON.stringify(r.ldNodes); if (/"(offers|aggregateRating|review|price|priceCurrency|availability)"\s*:/.test(flat)) sdProblems.push(`${r.p}: offers/review/rating/price markup present`); }
      { // every {"@id": ...} reference (an object with only @id) must be defined somewhere in the same graph
        const defs = new Set(); const refs = new Set();
        const walk = (o) => { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === 'object') { if (o['@id']) (Object.keys(o).length === 1 ? refs : defs).add(o['@id']); Object.values(o).forEach(walk); } };
        walk(r.ldNodes);
        const dangling = [...refs].filter((x) => !defs.has(x)); if (dangling.length) sdProblems.push(`${r.p}: @id referenced but not defined: ${dangling.slice(0, 2).join(', ')}`); }
      if (count('Article') !== (isGuide ? 1 : 0)) sdProblems.push(`${r.p}: Article nodes = ${count('Article')}`);
      const bc = r.ldNodes.find((n) => [].concat(n['@type']).includes('BreadcrumbList'));
      if (bc) {
        const els = bc.itemListElement || [];
        if (!els.every((e, i) => e.position === i + 1 && typeof e.item === 'string' && e.item.startsWith(origin + '/') && e.name)) sdProblems.push(`${r.p}: BreadcrumbList positions/urls invalid`);
        if (els.length && els[els.length - 1].item !== EXP + (r.p === '/' ? '/' : r.p)) sdProblems.push(`${r.p}: last breadcrumb is not this page`);
        if (els.length && els[0].item !== EXP + '/') sdProblems.push(`${r.p}: first breadcrumb is not Home`);
      }
      const urlsIn = JSON.stringify(r.ldNodes).match(/"(https?:\/\/[^"]+)"/g) || [];
      for (const u of urlsIn) { const v = u.slice(1, -1); if (!v.startsWith(origin + '/') && v !== origin && !/^https:\/\/schema\.org/.test(v)) sdProblems.push(`${r.p}: schema URL on another host: ${v}`); }
      r.ldNodes.forEach((n) => { if (n.sameAs) sameAsFound.push(r.p); const lg = n.logo; if (lg) logoUrls.add(typeof lg === 'string' ? lg : lg.url); });
    }
    expect(sdProblems.length === 0, `schema audit over ${store.length} pages: one Organization + WebSite + WebPage per page, @id/url self-consistent, no Product/offers/review/rating markup, Article only on guides, every @id reference defined, valid breadcrumbs, no retired/unsupported types`, sdProblems.slice(0, 6).join(' | '));
    expect(sameAsFound.length === 0, 'no sameAs (no verified profile URLs exist; none may be invented)', [...new Set(sameAsFound)].slice(0, 3).join(', '), 'WARN');
    for (const u of logoUrls) {
      const lr = await request(u.replace(origin, BASE));
      expect(!lr.error && lr.status === 200 && /^image\//i.test(lr.headers['content-type'] || '') && !/noindex/i.test(lr.headers['x-robots-tag'] || ''), `Organization logo ${u} is crawlable (200, image, no noindex)`, lr.error || `${lr.status} ${lr.headers && lr.headers['content-type']}`);
    }

    // ---- C. duplicate / cannibalisation heuristics
    section = 'Hard: duplicate content and cannibalisation';
    const grams = (t) => { const w = t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean); const g = new Set(); for (let i = 0; i + 5 <= w.length; i++) g.add(w.slice(i, i + 5).join(' ')); return g; };
    const info = store.map((r) => ({ p: r.p, g: grams(mainTextOf(r.html)), title: new Set(r.title.toLowerCase().replace(/\|.*$/, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3)) }));
    const sim = (a, b) => { let i = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a]; for (const x of s) if (l.has(x)) i++; return s.size ? i / s.size : 0; };
    const dupes = []; const near = [];
    for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
      const v = sim(info[i].g, info[j].g); if (v >= 0.6) dupes.push(`${info[i].p} ~ ${info[j].p} (${Math.round(v * 100)}%)`); else if (v >= 0.35) near.push(`${info[i].p} ~ ${info[j].p} (${Math.round(v * 100)}%)`);
    }
    expect(dupes.length === 0, 'no two pages share 60%+ of their main text (5-word shingles)', dupes.join('; '));
    expect(near.length === 0, 'no page pair shares 35%+ of its main text', near.join('; '), 'WARN');
    const tj = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (new Set([...a, ...b]).size || 1); };
    const titleClash = []; for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) { const v = tj(info[i].title, info[j].title); if (v >= 0.8 && info[i].title.size > 2) titleClash.push(`${info[i].p} ~ ${info[j].p}`); }
    expect(titleClash.length === 0, 'titles are not near-identical (word overlap < 80%)', titleClash.join('; '), 'WARN');
    const b2bPaths = ['/flour-manufacturer-india', '/flour-manufacturer-kanpur', '/bulk-flour-supplier-india', '/wholesale-flour-supplier', '/institutional-flour-supplier', '/supply-distribution-india'];
    const h1set = store.filter((r) => b2bPaths.includes(r.p)).map((r) => r.h1);
    expect(new Set(h1set).size === h1set.length && new Set(store.filter((r) => b2bPaths.includes(r.p)).map((r) => r.title)).size === h1set.length, 'the six B2B/manufacturer pages each have a distinct title and H1');
    const anchorCount = new Map();
    for (const r of store) for (const a of r.mainAnchors) { if (!b2bPaths.includes(a.href)) continue; const k = a.href + '|' + a.text.toLowerCase(); anchorCount.set(k, (anchorCount.get(k) || 0) + 1); }
    const byTarget = new Map(); for (const [k, n] of anchorCount) { const t = k.split('|')[0]; byTarget.set(t, (byTarget.get(t) || []).concat([[k.split('|')[1], n]])); }
    const repetitive = [...byTarget].filter(([, arr]) => { const tot = arr.reduce((s2, x) => s2 + x[1], 0); return tot >= 6 && Math.max(...arr.map((x) => x[1])) / tot > 0.5; }).map(([t, arr]) => `${t}: "${arr.sort((a, b) => b[1] - a[1])[0][0]}" x${arr.sort((a, b) => b[1] - a[1])[0][1]}`);
    expect(repetitive.length === 0, 'in-body anchor text to B2B pages is varied (no single phrase is more than half of the links)', repetitive.join('; '), 'WARN');
    const weakAnchors = []; for (const r of store) for (const a of r.mainAnchors) if (/^(click here|here|read more|more|link|this page)$/i.test(a.text.trim())) weakAnchors.push(`${r.p}: "${a.text}"`);
    expect(weakAnchors.length === 0, 'no "click here / read more" style anchors in page bodies', weakAnchors.slice(0, 4).join('; '));

    // ---- D. claims that must never appear (beyond the base claim patterns)
    section = 'Hard: prohibited claims';
    const HARD_CLAIMS = [
      ['no private-label / contract / white-label manufacturing claims', /\b(private[- ]label|contract manufactur\w*|white[- ]label|oem\b|your own brand|buyer'?s? brand|custom(er)? (brand|packing))/i],
      ['no production-capacity figures', /\b\d[\d,.]*\s*(tons?|tonnes?|mt|metric tons?|quintals?)\s*(\/|per)\s*(day|hour|month|year)|\bcapacity of\b|\bTPD\b/i],
      ['no certifications beyond ISO 9001:2015 and FSSAI', /\b(ISO\s?22000|HACCP|BRC|FSSC|GMP\b|halal|kosher|organic certified|NABL|AGMARK|BIS\b)/i],
      ['no reviews / ratings / testimonials', /\b(\d(\.\d)?\s*\/\s*5|five[- ]star|5[- ]star|customer reviews?|testimonials?|rated\b|trusted by (thousands|hundreds|\d))/i],
      ['no delivery promises or coverage claims', /\b(free delivery|same[- ]day (delivery|dispatch|shipping)|next[- ]day (delivery|dispatch)|delivery in \d|delivered within|pan[- ]india (delivery|network|supply network)|deliver(s|y)? (to|across) (all|every))/i],
      ['no invented minimum order', /\bminimum order (of|is|quantity of)\s*\d|\bMOQ\s*(of|:)\s*\d|\bat least \d+\s*(kg|tons?|bags)/i],
      ['no invented prices or discounts', /(₹|\bRs\.?|\bINR)\s?\d|\b\d+\s?% (off|discount)|\bdiscounts? (on|for|of)\b|\b(our|we offer the|we guarantee the) (best|lowest) price/i],
    ];
    for (const [label, rx] of HARD_CLAIMS) {
      const hits = store.filter((r) => rx.test(r.text) || rx.test(JSON.stringify(r.ldNodes))).map((r) => { const m = (r.text.match(rx) || [''])[0]; return `${r.p} ("${m}")`; });
      // the guides legitimately TELL BUYERS to ask a supplier about these things; only an affirmative claim fails
      const real = label.includes('invented minimum') || label.includes('delivery') ? hits.filter((h) => !/ask|should|whether|if /i.test(h)) : hits;
      expect(real.length === 0, label, real.slice(0, 3).join('; '));
    }
    expect(store.every((r) => !/\b(areaServed|openingHours|geo|aggregateRating|offers)\b/.test(JSON.stringify(r.ldNodes))), 'schema never carries areaServed / openingHours / geo / rating / offers');

    // ---- E. HTTP behaviour: headers, validators, compression
    section = 'Hard: HTTP headers, validators and compression';
    const lvl = isProd ? 'WARN' : 'FAIL';
    const h0 = await request(BASE + '/', { headers: { 'Accept-Encoding': 'br, gzip' } });
    expect(h0.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff', h0.headers['x-content-type-options'] || '(none)', lvl);
    expect(!!h0.headers['referrer-policy'], 'Referrer-Policy header present', '(none)', lvl);
    expect(!!h0.headers['permissions-policy'], 'Permissions-Policy header present', '(none)', lvl);
    expect(['br', 'gzip'].includes(h0.headers['content-encoding']), 'HTML compressed (Brotli preferred, gzip accepted)', h0.headers['content-encoding'] || '(none)', lvl);
    const gz = await request(BASE + '/', { headers: { 'Accept-Encoding': 'gzip' } });
    expect(gz.headers['content-encoding'] === 'gzip' || isProd, 'gzip still served to clients that do not offer Brotli', gz.headers['content-encoding'] || '(none)', lvl);
    expect(/no-cache|max-age=\d/.test(h0.headers['cache-control'] || '') || !!h0.headers.etag, 'HTML carries a validator or an explicit Cache-Control', 'neither ETag nor Cache-Control', lvl);
    if (h0.headers.etag) {
      const c304 = await request(BASE + '/', { headers: { 'If-None-Match': h0.headers.etag, 'Accept-Encoding': 'br, gzip' } });
      expect(c304.status === 304, 'HTML answers If-None-Match with 304 Not Modified', 'status ' + c304.status, lvl);
    } else skip('HTML 304 check', 'no ETag on HTML');
    const adm = await request(BASE + '/admin/login');
    expect(/no-store/.test(adm.headers['cache-control'] || '') || !adm.headers.etag, 'admin responses are never cached or revalidated by content hash', adm.headers['cache-control'] || '(none)', lvl);
    const homeRec = store.find((r) => r.p === '/');
    const cssHref = ((homeRec && homeRec.html.match(/href="(\/css\/style\.css\?v=[^"]+)"/)) || [])[1];
    if (cssHref) {
      const c1 = await request(BASE + cssHref, { headers: { 'Accept-Encoding': 'br, gzip' } });
      expect(c1.headers['content-encoding'] === 'br' || (isProd && !!c1.headers['content-encoding']), 'CSS compressed with Brotli', c1.headers['content-encoding'] || '(none)', lvl);
      if (c1.headers.etag) { const c2 = await request(BASE + cssHref, { headers: { 'If-None-Match': c1.headers.etag } }); expect(c2.status === 304, 'static asset answers If-None-Match with 304', 'status ' + c2.status, lvl); }
      const stale = await request(BASE + '/css/style.css?v=00000000');
      expect(!/immutable/.test(stale.headers['cache-control'] || ''), 'a stale or invented ?v= never gets the immutable one-year cache', stale.headers['cache-control'] || '', lvl);
    }
    const ik = (() => { try { return (require('fs').readFileSync(require('path').join(process.env.HC_REPO_ROOT || process.cwd(), 'lib/indexnow.js'), 'utf8').match(/INDEXNOW_KEY = '([0-9a-f]{16,128})'/) || [])[1]; } catch (e) { return null; } })();
    if (ik) {
      const kr = await request(BASE + '/' + ik + '.txt');
      expect(kr.status === 200 && kr.body === ik && /text\/plain/i.test(kr.headers['content-type'] || ''), 'IndexNow key file is served at /<key>.txt with the exact key', kr.error || `status ${kr.status}`, isProd ? 'WARN' : 'FAIL');
      expect(!locs.some((l) => l.includes(ik)), 'the IndexNow key file is not in the sitemap');
    } else skip('IndexNow key file', 'lib/indexnow.js not found relative to the working directory (run from the repo root)');

    // ---- F. hostname / protocol consistency inside the HTML
    section = 'Hard: hostname and HTTPS consistency';
    const ALLOWED = [origin, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://schema.org', 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'];
    const hostBad = []; const externalHosts = new Set();
    for (const r of store) {
      const abs = (r.html.match(/(?:href|src|content|action)="(https?:\/\/[^"]+)"/g) || []).map((x) => x.replace(/^[a-z]+="/, '').slice(0, -1));
      for (const u of abs) {
        if (ALLOWED.some((a) => u === a || u.startsWith(a + '/') || u.startsWith(a + '?'))) continue;
        if (u.includes(origin.replace(/^https?:\/\//, ''))) hostBad.push(`${r.p}: ${u}`);   // our domain on the wrong host/protocol
        else if (/^http:/i.test(u)) hostBad.push(`${r.p}: insecure external link ${u}`);
        else externalHosts.add(new URL(u).host);                                               // other https sites (e.g. a verification portal)
      }
      if (/\s(?:href|src)="http:\/\/(?!www\.w3\.org)/.test(r.html)) hostBad.push(`${r.p}: insecure http:// link`);
      if (new RegExp('//www\\.' + origin.replace(/^https?:\/\//, '').replace(/\./g, '\\.')).test(r.html)) hostBad.push(`${r.p}: www host referenced`);
    }
    expect(hostBad.length === 0, 'every absolute URL in every page is on the canonical HTTPS host (or fonts); no http:// and no www', hostBad.slice(0, 4).join('; '));
    pass('external https hosts linked from pages: ' + ([...externalHosts].join(', ') || 'none'));
    expect(store.every((r) => /<html[^>]+lang="en(-IN)?"/i.test(r.html)), '<html lang> is English on every page');
    expect(store.every((r) => /<meta name="viewport" content="width=device-width, initial-scale=1">/.test(r.html)), 'viewport meta is correct on every page');

    // ---- G. performance smoke (document, CSS/JS, images, TTFB)
    section = 'Hard: performance smoke';
    const css = (cssHref && (await request(BASE + cssHref, { headers: { 'Accept-Encoding': 'identity' } }))) || null;
    const jsHref = ((homeRec && homeRec.html.match(/src="(\/js\/main\.js\?v=[^"]+)"/)) || [])[1]; const js = jsHref ? await request(BASE + jsHref) : null;
    if (css) expect(css.body.length < 120000, `CSS size ${Math.round(css.body.length / 1024)} KB uncompressed (< 120 KB)`, '', 'WARN');
    if (js) expect(js.body.length < 40000, `JS size ${Math.round(js.body.length / 1024)} KB uncompressed (< 40 KB)`, '', 'WARN');
    const heavy = []; const lcpBad = []; const eagerHeavy = []; const blocking = [];
    for (const r of store) {
      if (r.html.length > 160000) heavy.push(`${r.p} ${Math.round(r.html.length / 1024)} KB`);
      const imgsHere = (r.html.match(/<img\b[^>]*>/gi) || []).map(attrs);
      const eager = imgsHere.filter((i) => i.loading !== 'lazy');
      if (eager.length > 3 && r.p !== '/') eagerHeavy.push(`${r.p}: ${eager.length} eager images`);
      const first = imgsHere.find((i) => i.fetchpriority === 'high'); if (first && first.loading === 'lazy') lcpBad.push(r.p);
      const headHtml = (r.html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
      const cssLinks = (headHtml.match(/<link[^>]+rel="stylesheet"/gi) || []).length; const syncScripts = (headHtml.match(/<script\b(?![^>]*type="application\/ld\+json")[^>]*src=/gi) || []).length;
      if (cssLinks > 2 || syncScripts) blocking.push(`${r.p}: ${cssLinks} stylesheets, ${syncScripts} head scripts`);
    }
    expect(heavy.length === 0, 'every HTML document is under 160 KB', heavy.join('; '), 'WARN');
    expect(lcpBad.length === 0, 'the priority (LCP) image is never lazy-loaded', lcpBad.join(', '));
    expect(eagerHeavy.length === 0, 'inner pages load at most 3 images eagerly', eagerHeavy.join('; '), 'WARN');
    expect(blocking.length === 0, 'at most 2 render-blocking stylesheets and no blocking head scripts', blocking.slice(0, 3).join('; '), 'WARN');
    const webpSeen = new Set(); const imgUrls = new Map();
    for (const r of store) for (const i of (r.html.match(/<img\b[^>]*>/gi) || []).map(attrs)) if (i.src && i.src.startsWith('/')) imgUrls.set(i.src, (imgUrls.get(i.src) || new Set()).add(r.p));
    const webpMiss = [];
    await pool([...imgUrls.keys()], 6, async (u) => {
      const wp = u.replace(/\.(jpe?g|png)$/i, '.webp'); const r = await request(BASE + wp, { method: 'HEAD' });
      if (/\.(jpe?g|png)$/i.test(u) && /^\/images\/(hero|about-mill|products|facility|quality)\//.test(u) && (r.error || r.status !== 200)) webpMiss.push(u);
    });
    expect(webpMiss.length === 0, 'every large content image has a WebP copy', webpMiss.slice(0, 4).join(', '));
    const srcsetBad = []; for (const r of store) for (const m of r.html.matchAll(/<source type="image\/webp" srcset="([^"]+)"/g)) for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (!imgUrls.has(u) && !webpSeen.has(u)) webpSeen.add(u); }
    const ttfb = []; for (const pth of ['/', '/products', '/guides/how-to-store-flour']) { const t0 = Date.now(); const rr = await request(BASE + pth); ttfb.push(Date.now() - t0); void rr; }
    expect(Math.max(...ttfb) < (isProd ? 1500 : 500), `response time ${ttfb.join('/')} ms for three sample pages`, '', 'WARN');
    for (const u of webpSeen) { const rr = await request(BASE + u, { method: 'HEAD' }); if (rr.error || rr.status !== 200 || !/image\/webp/.test(rr.headers['content-type'] || '')) srcsetBad.push(u); }
    expect(srcsetBad.length === 0, `all ${webpSeen.size} WebP candidates in <picture> are served as image/webp with 200`, srcsetBad.slice(0, 4).join(', '));

    // ---- matrix
    if (MATRIX) {
      console.log('\n== Indexability matrix');
      console.log('URL'.padEnd(46) + 'ST  IDX CAN SMAP TITLE DESC H1 SCHEMA                          IN');
      const inb = new Map(store.map((r) => [r.p, 0])); store.forEach((a) => new Set(a.allLinks.map(cleanPath)).forEach((h) => { if (h !== a.p && inb.has(h)) inb.set(h, inb.get(h) + 1); }));
      for (const r of store) {
        const types = [...new Set([].concat(...r.ldNodes.map((n) => [].concat(n['@type'] || []))))].filter((t) => !['Organization', 'WebSite', 'ImageObject'].includes(t)).join(',');
        console.log(r.p.padEnd(46) + String(r.status).padEnd(4) + (isIndexable(r) ? 'yes ' : 'NO  ') + (r.canon === EXP + (r.p === '/' ? '/' : r.p) ? 'ok  ' : 'BAD ') + (inSitemap.has(r.p) ? 'yes  ' : 'no   ') + String(r.title.length).padEnd(6) + String((r.desc || '').length).padEnd(5) + String(r.h1Count).padEnd(3) + types.slice(0, 31).padEnd(32) + inb.get(r.p));
      }
    }
  }

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
  {
    // The app compresses text responses itself; in production a reverse proxy may do it instead (WARN only there).
    const lvl = isProd ? 'WARN' : 'FAIL';
    const zh = await request(BASE + '/', { headers: { 'Accept-Encoding': 'gzip, br' } });
    expect(!!zh.headers['content-encoding'], 'HTML is compressed when the client accepts gzip', 'no Content-Encoding header', lvl);
    expect(/accept-encoding/i.test(zh.headers.vary || ''), 'compressed HTML sends Vary: Accept-Encoding', 'Vary: ' + (zh.headers.vary || '(none)'), lvl);
    const css = (pages[0] && /href="(\/css\/style\.css\?v=[^"]+)"/.exec((pages.find((x) => x.path === '/') || { r: { body: '' } }).r.body)) || null;
    if (css) {
      const cr = await request(BASE + css[1], { headers: { 'Accept-Encoding': 'gzip' } });
      expect(!!cr.headers['content-encoding'], 'CSS is compressed when the client accepts gzip', 'no Content-Encoding header', lvl);
      expect(/immutable/.test(cr.headers['cache-control'] || '') && /max-age=3[0-9]{7}/.test(cr.headers['cache-control'] || ''), 'fingerprinted CSS is cached for a year (immutable)', cr.headers['cache-control'] || '(none)', lvl);
    }
    if (isProd) expect(!!zh.headers['strict-transport-security'], 'HSTS header present', 'missing Strict-Transport-Security', 'WARN');
    else skip('HSTS', 'production-only (usually set by the reverse proxy)');
  }

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
