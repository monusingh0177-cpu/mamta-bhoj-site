'use strict';
// Page-level audit over an inventory. Findings are facts about the site (never guesses); `fix` says whether a
// deterministic, provably-safe automatic fix exists (currently none: every content change goes through the
// validated patch pipeline).
function auditInventory(inv, opts) {
  const o = opts || {}; const origin = o.origin || inv.origin; const out = [];
  const add = (path, severity, code, msg) => out.push({ path, severity, code, message: msg });
  const titles = new Map(), descs = new Map();
  for (const [path, p] of Object.entries(inv.pages)) {
    if (!p.indexable) { if (p.inSitemap) add(path, 'critical', 'noindex-in-sitemap', 'page is in the sitemap but is noindex'); continue; }
    const expected = origin + (path === '/' ? '/' : path);
    if (!p.canonical) add(path, 'critical', 'canonical-missing', 'no canonical tag');
    else if (p.canonical !== expected) add(path, 'critical', 'canonical-mismatch', `canonical is ${p.canonical}, expected ${expected}`);
    if (p.h1.length !== 1) add(path, 'high', 'h1-count', `${p.h1.length} H1 elements (expected 1)`);
    if (!p.title) add(path, 'high', 'title-missing', 'empty title'); else if (p.title.length < 25 || p.title.length > 62) add(path, 'medium', 'title-length', `title is ${p.title.length} characters`);
    if (!p.description) add(path, 'high', 'description-missing', 'empty meta description'); else if (p.description.length < 110 || p.description.length > 165) add(path, 'medium', 'description-length', `meta description is ${p.description.length} characters`);
    if (p.jsonLdErrors.length) add(path, 'critical', 'jsonld-malformed', p.jsonLdErrors[0]);
    if (p.jsonLdTypes.some((t) => /(^|\+)Product(\+|$)/.test(t))) add(path, 'high', 'product-schema', 'Product structured data present (needs offers/review/aggregateRating, none are published)');
    if (/"(offers|aggregateRating|review|price|priceCurrency)"\s*:/.test(JSON.stringify(p.jsonLdNodes))) add(path, 'high', 'unsupported-schema', 'offers/review/rating/price markup present');
    if (p.imgMissingAlt) add(path, 'medium', 'img-alt', `${p.imgMissingAlt} image(s) without alt text`);
    if (p.linksIn < 3 && path !== '/') add(path, 'medium', 'few-inlinks', `only ${p.linksIn} internal link(s) point here`);
    if (p.words < 250 && !/^\/(contact|certifications)$/.test(path)) add(path, 'low', 'thin-content', `${p.words} words`);
    (titles.get(p.title) || titles.set(p.title, []).get(p.title)).push(path); (descs.get(p.description) || descs.set(p.description, []).get(p.description)).push(path);
    for (const l of p.linksOut) if (!inv.pages[l] && !/^\/(admin|images|css|js|uploads|documents)(\/|$)/.test(l) && !/\.[a-z0-9]{2,4}$/i.test(l)) add(path, 'high', 'broken-internal-link', `links to ${l}, which did not return 200`);
  }
  for (const [t, ps] of titles) if (t && ps.length > 1) add(ps[0], 'high', 'duplicate-title', `same title on ${ps.join(', ')}`);
  for (const [d, ps] of descs) if (d && ps.length > 1) add(ps[0], 'high', 'duplicate-description', `same description on ${ps.join(', ')}`);
  for (const n of inv.nonOk) if (n.status >= 500 || n.status === 0) add(n.path, 'critical', 'http-5xx', `HTTP ${n.status || 'error'}${n.error ? ' ' + n.error : ''}`);
    else if (n.status === 404 && inv.sitemapPaths.includes(n.path)) add(n.path, 'critical', 'sitemap-404', 'sitemap URL returns 404');
  if (inv.robotsStatus !== 200 || !/Disallow:\s*\/admin/i.test(inv.robotsTxt || '')) add('/robots.txt', 'critical', 'robots', 'robots.txt missing or does not disallow /admin');
  if (/^\s*Disallow:\s*\/\s*$/m.test(inv.robotsTxt || '')) add('/robots.txt', 'critical', 'robots-block-all', 'robots.txt blocks the whole site');
  return out;
}
module.exports = { auditInventory };
