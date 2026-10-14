'use strict';
// Deterministic fixers: turn audit findings and Search Console opportunities into concrete, validated patches
// WITHOUT an AI. A fixer only emits a change when the fix is mechanical and provably safe:
//   * it edits an allow-listed source file inside the block of one page,
//   * it adds nothing that is not already published on the site (no new wording, claims, prices or places),
//   * the result is re-validated by patch.validate() and by every quality gate before it can be committed.
//
// Implemented fixer: "related-link" - a guide that has too few internal links pointing to it (audit code
// `few-inlinks`) or that is the best page for a rising commercial query but is thinly linked gets listed in the
// `related: [...]` list of the most topically close guide (shared `products`) that does not link to it yet.
// Those lists are rendered as real <a href="/guides/<slug>"> links, so an internal link is created for real.
// Metadata wording, body copy and new pages are NOT fixed here: they need business facts, so they stay with the
// reviewable AI/proposal path or with a person.
const fs = require('fs');
const path = require('path');
const { RELATED_MAX } = require('./patch');

const GUIDE_FILES = ['views/guides.js', 'views/guides-more.js', 'views/guides-phase3.js'];
const MAX_LIST_AFTER = 5;     // keep the related lists short and readable

const list = (text) => (text.match(/'([a-z0-9-]+)'/g) || []).map((x) => x.slice(1, -1));

// -> [{ slug, file, products[], related[], relatedText }] parsed from the guide source files
function parseGuides(repoDir) {
  const out = [];
  for (const file of GUIDE_FILES) {
    let src; try { src = fs.readFileSync(path.join(repoDir, file), 'utf8'); } catch (e) { continue; }
    const starts = []; const re = /slug: *'([a-z0-9-]+)'/g; let m;
    while ((m = re.exec(src))) starts.push({ slug: m[1], at: m.index });
    for (let i = 0; i < starts.length; i++) {
      const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
      const block = src.slice(starts[i].at, end);
      const rel = block.match(/related: \[((?:'[a-z0-9-]+'(?:, )?)*)\]/); const prod = block.match(/products: \[((?:'[a-z0-9-]+'(?:, )?)*)\]/);
      if (!rel || !prod) continue;
      out.push({ slug: starts[i].slug, file, products: list(prod[1]), related: list(rel[1]), relatedText: rel[0] });
    }
  }
  return out;
}

// ctx: { repoDir, inv, findings, opportunities, limit } -> [{ id, kind, page, target, reason, source, patches[], expect }]
function plan(ctx) {
  const guides = parseGuides(ctx.repoDir); const bySlug = new Map(guides.map((g) => [g.slug, g]));
  const targets = []; const seen = new Set();
  const addTarget = (p, reason, source) => { const slug = p.startsWith('/guides/') ? p.slice('/guides/'.length) : ''; if (!slug || seen.has(slug) || !bySlug.has(slug)) return; const pg = ctx.inv.pages[p]; if (!pg || !pg.indexable) return; seen.add(slug); targets.push({ slug, path: p, reason, source }); };
  for (const f of (ctx.findings || []).filter((x) => x.code === 'few-inlinks')) addTarget(f.path, f.message, 'audit:few-inlinks');
  for (const o of ctx.opportunities || []) {
    const p = o.bestPage; const pg = p && ctx.inv.pages[p];
    if (pg && pg.linksIn < (ctx.opportunityInlinks || 5) && /improve existing page/.test(o.action || '')) addTarget(p, `best page for the query "${o.query}" (${o.impressions} impressions) but only ${pg.linksIn} internal link(s) point to it`, 'opportunity');
  }
  const fixes = [];
  for (const t of targets) {
    const T = bySlug.get(t.slug);
    const cands = guides.filter((g) => g.slug !== t.slug && !g.related.includes(t.slug) && g.related.length + 1 <= MAX_LIST_AFTER && g.related.length + 1 <= RELATED_MAX
      && !((ctx.inv.pages['/guides/' + g.slug] || {}).linksOut || []).includes(t.path) && ctx.inv.pages['/guides/' + g.slug] && ctx.inv.pages['/guides/' + g.slug].indexable)
      .map((g) => ({ g, overlap: g.products.filter((x) => T.products.includes(x)).length })).filter((x) => x.overlap >= 1)
      .sort((a, b) => b.overlap - a.overlap || a.g.related.length - b.g.related.length || (a.g.slug < b.g.slug ? -1 : 1));
    if (!cands.length) continue;
    const G = cands[0].g; const page = '/guides/' + G.slug;
    const replace = G.relatedText.replace(/\]$/, `, '${t.slug}']`).replace('[, ', '[');
    fixes.push({
      id: `related:${G.slug}->${t.slug}`, kind: 'related', page, target: t.path, source: t.source,
      reason: `${t.path}: ${t.reason}. Listing it as a related guide on ${page} (shares the product topic ${G.products.filter((x) => T.products.includes(x)).join(', ')}) adds a real internal link.`,
      patches: [{ page, kind: 'related', file: G.file, find: G.relatedText, replace, rationale: `internal link ${page} -> ${t.path} (existing guide, shared product topic)`, confidence: 1, deterministic: true }],
      expect: { page, includes: [`href="${t.path}"`] },
    });
    if (ctx.limit && fixes.length >= ctx.limit) break;
  }
  return fixes;
}

module.exports = { plan, parseGuides };
