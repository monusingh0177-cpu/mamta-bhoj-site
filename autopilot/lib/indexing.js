'use strict';
// Indexing discrepancies: places where Google's URL Inspection result disagrees with what the site says about itself.
// Everything here is a comparison of two facts (our page vs Google's report); it never guesses why Google chose something and
// never implies that fixing it will cause indexing. URL Inspection is a status read, not a request to crawl.
//
// inspections: [{ url, verdict, coverageState, indexingState, robotsTxtState, pageFetchState, googleCanonical, userCanonical, error? }]
// inv: site inventory (pages by path). -> [{ url, path, severity: 'high'|'medium', code, message }]
function discrepancies(inspections, inv) {
  const out = []; const pathOf = (u) => { try { return new URL(u).pathname.replace(/(.)\/$/, '$1'); } catch (e) { return u; } };
  const norm = (u) => String(u || '').replace(/\/$/, '');
  for (const i of inspections || []) {
    if (!i || i.error || !i.verdict) continue;
    const path = pathOf(i.url); const page = (inv && inv.pages || {})[path];
    const add = (severity, code, message) => out.push({ url: i.url, path, severity, code, message });
    if (page && page.indexable && i.verdict !== 'PASS') add(i.verdict === 'FAIL' ? 'high' : 'medium', 'not-indexed', `the page is indexable on the site, but Google reports "${i.coverageState || i.verdict}"`);
    if (i.googleCanonical && i.userCanonical && norm(i.googleCanonical) !== norm(i.userCanonical)) add('medium', 'canonical-differs', `Google chose ${i.googleCanonical} as canonical; the page declares ${i.userCanonical}`);
    if (page && page.indexable && /DISALLOWED|BLOCKED/i.test(i.robotsTxtState || '')) add('high', 'robots-blocked', `the page is indexable on the site, but Google reports robots.txt state ${i.robotsTxtState}`);
    if (i.pageFetchState && !/^SUCCESSFUL$/i.test(i.pageFetchState) && page) add('medium', 'fetch-problem', `Google reports page fetch state ${i.pageFetchState}`);
    if (page && !page.indexable && /^INDEXING_ALLOWED$/i.test(i.indexingState || '')) add('medium', 'noindex-not-seen', 'the site marks the page noindex, but Google still reports indexing as allowed (it may not have recrawled yet)');
  }
  return out;
}

// sitemap: result of gsc.sitemapStatus(); inv: inventory. -> { ok, problems[] }
function sitemapProblems(sm, inv) {
  const problems = [];
  if (!sm) return { ok: true, problems };
  if (!sm.submitted) problems.push('Google has no record of this sitemap: it has not been submitted through Search Console yet');
  else {
    if (sm.errors > 0) problems.push(`Google reports ${sm.errors} error(s) in the sitemap`);
    if (sm.warnings > 0) problems.push(`Google reports ${sm.warnings} warning(s) in the sitemap`);
    if (sm.urlsSubmitted != null && inv && Math.abs(sm.urlsSubmitted - inv.sitemapPaths.length) > 0) problems.push(`Google counts ${sm.urlsSubmitted} submitted URL(s) but the live sitemap lists ${inv.sitemapPaths.length} (Google may not have re-downloaded it yet)`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { discrepancies, sitemapProblems };
