'use strict';
// Turns Search Console rows into scored, mapped opportunities. People-first rules:
//  * relevance to the real business is a hard gate (generic or unrelated traffic is never an opportunity);
//  * commercial intent is weighted strongly, but a query still has to fit an existing page;
//  * cannibalisation risk is computed before anything is proposed.
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'for', 'to', 'and', 'or', 'is', 'are', 'what', 'how', 'by', 'on', 'with', 'from', 'it', 'its', 'my', 'me', 'at', 'as']);
const BRAND = /\b(devmam|mamta|bhoj|flourish|devmamflourish)/i;
// words that make a query about this business's real subject matter
const VOCAB = new Set(['flour', 'atta', 'maida', 'besan', 'sooji', 'suji', 'rava', 'semolina', 'wheat', 'chakki', 'tandoori', 'gram', 'chana', 'mill', 'milling', 'manufacturer', 'manufacturers', 'supplier', 'suppliers', 'wholesale', 'bulk', 'bakery', 'dough', 'roti', 'chapati', 'paratha', 'naan', 'upma', 'halwa', 'pakora', 'kadhi', 'grain', 'refined', 'whole', 'stone', 'ground', 'granules', 'cereal']);
const COMMERCIAL = { bulk: 3, supplier: 3, suppliers: 3, wholesale: 3, wholesaler: 3, manufacturer: 3, manufacturers: 3, manufacturing: 2, distributor: 2, distributors: 2, dealer: 2, dealership: 2, procurement: 2, institutional: 2, restaurant: 2, restaurants: 2, 'food service': 2, foodservice: 2, caterer: 2, caterers: 2, bakery: 1, commercial: 2, india: 1, buy: 1, supply: 2, distribution: 2 };
const INFORMATIONAL = /^(how|what|why|when|which|where|can|does|is|are|meaning|difference|recipe)\b|\b(meaning|difference between|vs|versus|called in|made of|made up of|made from|recipe|benefits|uses|is made)\b/i;

const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
const stem = (t) => t.replace(/(ers|er|s)$/, '');

function classify(query) {
  const q = String(query || '').toLowerCase();
  const toks = tokens(q);
  if (BRAND.test(q)) return { kind: 'branded', relevant: false, reason: 'brand/navigational query: tracked, not optimised for' };
  const hits = toks.filter((t) => VOCAB.has(t) || VOCAB.has(stem(t)));
  if (!hits.length) return { kind: 'irrelevant', relevant: false, reason: 'no connection to flour products or B2B supply' };
  let commercial = 0;
  for (const [w, wt] of Object.entries(COMMERCIAL)) if (w.includes(' ') ? q.includes(w) : toks.includes(w)) commercial += wt;
  const informational = INFORMATIONAL.test(q);
  const intent = Math.min(1, commercial / 5);
  const kind = commercial >= 3 && !informational ? 'commercial' : informational ? 'informational' : toks.length <= 2 ? 'product-head' : 'product';
  const fit = kind === 'commercial' ? 1 : kind === 'product' ? 0.8 : kind === 'product-head' ? 0.7 : 0.45;
  return { kind, relevant: true, intent, businessFit: fit, reason: `${kind} query (${hits.join(', ')})` };
}

// expected CTR by position (conservative curve) for the CTR-gap signal
const expectedCtr = (pos) => (pos <= 1 ? 0.28 : pos <= 2 ? 0.15 : pos <= 3 ? 0.1 : pos <= 5 ? 0.06 : pos <= 10 ? 0.025 : pos <= 20 ? 0.008 : 0.002);

function pageFit(queryTokens, page) {
  const bag = (txt) => new Set(tokens(txt).map(stem));
  const T = bag(page.title), H = bag(page.h1.join(' ')), S = bag((page.headings || []).map((h) => h.text).join(' ')), D = bag(page.description), B = bag((page.text || '').slice(0, 6000));
  let score = 0; const qs = queryTokens.map(stem);
  for (const t of qs) score += (T.has(t) ? 3 : 0) + (H.has(t) ? 3 : 0) + (S.has(t) ? 1.5 : 0) + (D.has(t) ? 1 : 0) + (B.has(t) ? 0.5 : 0);
  return qs.length ? score / (qs.length * 9) : 0;
}

function mapToPages(query, inv, gscPages, limit) {
  const qt = tokens(query);
  const cands = Object.entries(inv.pages).filter(([, p]) => p.indexable && p.inSitemap).map(([path, p]) => {
    const g = gscPages && gscPages[path];
    return { path, fit: pageFit(qt, p) + (g ? 0.1 * Math.min(1, g.impressions / 20) : 0), gscImpressions: g ? g.impressions : 0 };
  }).sort((a, b) => b.fit - a.fit);
  return cands.slice(0, limit || 3);
}

// 0..1: how likely two existing pages are competing for this query
function cannibalRisk(cands, gscPages) {
  let risk = 0; const reasons = [];
  if (cands.length > 1 && cands[0].fit > 0 && cands[1].fit >= 0.8 * cands[0].fit) { risk += 0.5; reasons.push(`pages ${cands[0].path} and ${cands[1].path} fit the query almost equally`); }
  const imps = Object.entries(gscPages || {}).map(([p, v]) => [p, v.impressions]).sort((a, b) => b[1] - a[1]);
  if (imps.length > 1 && imps[1][1] >= 0.2 * imps[0][1]) { risk += 0.5; reasons.push(`Google shows ${imps[0][0]} and ${imps[1][0]} for this query`); }
  return { risk: Math.min(1, risk), reasons };
}

function score(q, cls, risk) {
  const pos = q.position; const imps = q.impressions;
  const posBand = pos < 4 ? 0.2 : pos <= 40 ? (pos <= 20 ? 1 : 1 - (pos - 20) / 25) : 0;
  const impN = Math.min(1, Math.log10(1 + imps) / 2);
  const ctrGap = Math.max(0, Math.min(1, (expectedCtr(pos) - q.ctr) / Math.max(0.01, expectedCtr(pos))));
  const trend = q.prevImpressions == null ? 0.3 : Math.max(0, Math.min(1, (imps - q.prevImpressions) / Math.max(5, q.prevImpressions)));
  const base = 35 * (cls.intent == null ? 0 : cls.intent) + 20 * posBand + 20 * impN + 15 * ctrGap + 10 * trend;
  return Math.round(Math.max(0, base * (cls.businessFit || 0) * (1 - 0.5 * risk)) * 10) / 10;
}

// rows: [{keys:[query,page],clicks,impressions,ctr,position}] for the current and previous windows
function analyse(currentRows, previousRows, inv, cfg, targets) {
  const agg = (rows) => {
    const m = new Map();
    for (const r of rows || []) {
      const [query, pageUrl] = r.keys; let path; try { path = new URL(pageUrl).pathname.replace(/(.)\/$/, '$1'); } catch (e) { path = pageUrl; }
      const q = m.get(query) || { query, clicks: 0, impressions: 0, posW: 0, pages: {} };
      q.clicks += r.clicks; q.impressions += r.impressions; q.posW += r.position * r.impressions;
      const pg = q.pages[path] || { impressions: 0, clicks: 0, posW: 0 }; pg.impressions += r.impressions; pg.clicks += r.clicks; pg.posW += r.position * r.impressions; q.pages[path] = pg; m.set(query, q);
    }
    for (const q of m.values()) { q.position = q.impressions ? q.posW / q.impressions : 0; q.ctr = q.impressions ? q.clicks / q.impressions : 0; for (const pg of Object.values(q.pages)) pg.position = pg.impressions ? pg.posW / pg.impressions : 0; }
    return m;
  };
  const cur = agg(currentRows), prev = agg(previousRows);
  const out = [];
  for (const q of cur.values()) {
    const p = prev.get(q.query); q.prevImpressions = p ? p.impressions : null; q.prevPosition = p ? p.position : null;
    const cls = classify(q.query);
    const cands = cls.relevant ? mapToPages(q.query, inv, q.pages) : [];
    const can = cls.relevant ? cannibalRisk(cands, q.pages) : { risk: 0, reasons: [] };
    const pos = q.position;
    const flags = [];
    if (q.prevImpressions != null && q.impressions > q.prevImpressions) flags.push('rising impressions');
    if (q.prevPosition != null && q.position < q.prevPosition - 0.5) flags.push('position improving');
    if (pos >= 4 && pos <= 40 && q.impressions >= 5) flags.push('positions 4-40');
    if (q.impressions >= 10 && q.ctr < expectedCtr(pos) * 0.6) flags.push('high impressions, low CTR');
    if (cls.kind === 'commercial') flags.push('commercial intent');
    const top = cands[0];
    const wrongPage = cls.relevant && top && Object.keys(q.pages).length && !q.pages[top.path] && top.fit > 0.3 ? `Google shows ${Object.keys(q.pages)[0]} but ${top.path} fits better` : null;
    if (wrongPage) flags.push('ranking for the wrong page');
    const targetKeyword = cls.relevant ? ((targets && targets.match) ? targets.match(q.query) : null) : null;
    if (targetKeyword) flags.push('target keyword');
    const sc = cls.relevant ? Math.min(100, Math.round(score(q, cls, can.risk) * (targetKeyword ? 1.15 : 1) * 10) / 10) : 0;
    out.push({ query: q.query, kind: cls.kind, relevant: cls.relevant, reason: cls.reason, clicks: q.clicks, impressions: q.impressions, ctr: Math.round(q.ctr * 10000) / 10000, position: Math.round(pos * 10) / 10, prevImpressions: q.prevImpressions, prevPosition: q.prevPosition == null ? null : Math.round(q.prevPosition * 10) / 10, flags, score: sc, bestPage: top ? top.path : null, bestPageFit: top ? Math.round(top.fit * 100) / 100 : 0, alternatives: cands.slice(1).map((c) => c.path), cannibalRisk: Math.round(can.risk * 100) / 100, cannibalReasons: can.reasons, wrongPage,
      targetKeyword, action: !cls.relevant ? 'ignore' : can.risk >= 0.5 ? 'consolidate on the strongest page / adjust internal links (no new page)' : !top || top.fit < 0.15 ? 'possible content gap: needs human review (new page only if every gate passes)' : sc >= cfg.limits.minScore ? 'improve existing page' : 'monitor' });
  }
  out.sort((a, b) => b.score - a.score || b.impressions - a.impressions);
  return out;
}

module.exports = { classify, analyse, mapToPages, cannibalRisk, score, tokens, expectedCtr };
