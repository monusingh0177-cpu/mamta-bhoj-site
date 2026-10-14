'use strict';
// Route inventory: the sitemap plus every internal link found on those pages, fetched over HTTP (live site or a
// local preview). For each URL: status, title, description, H1s, canonical, robots, words, JSON-LD, links, hash.
// GET requests are idempotent: transient failures (network blip, 429, 5xx) are retried a bounded number of times, so one
// dropped connection does not become a failed run or a false "critical" finding.
const { requestRetry: request, sha1 } = require('./util');

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, ' ');
const strip = (h) => decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')); return m ? decode(m[1]) : null; };

function parsePage(html, path, origin) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  const descTag = (html.match(/<meta[^>]*name="description"[^>]*>/i) || [])[0] || '';
  const robotsTag = (html.match(/<meta[^>]*name="robots"[^>]*>/i) || [])[0] || '';
  const canonTag = (html.match(/<link[^>]*rel="canonical"[^>]*>/i) || [])[0] || '';
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]));
  const heads = [...html.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: +m[1], text: strip(m[2]) }));
  const main = (html.match(/<main[\s\S]*<\/main>/i) || [html])[0];
  const text = strip(main);
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const ld = []; const ldErrors = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); for (const n of (j['@graph'] || [j])) ld.push(n); } catch (e) { ldErrors.push(e.message); }
  }
  const links = new Set();
  for (const m of html.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>/gi)) {
    let h = decode(m[1]); if (/^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
    try { const u = new URL(h, origin + path); if (u.origin === origin || u.hostname === new URL(origin).hostname) links.add(u.pathname.replace(/(.)\/$/, '$1')); } catch (e) { /* skip */ }
  }
  const ogTag = (html.match(/<meta[^>]*property="og:url"[^>]*>/i) || [])[0] || '';
  const metaRobots = (attr(robotsTag, 'content') || '').toLowerCase();
  return {
    title, description: attr(descTag, 'content') || '', ogUrl: attr(ogTag, 'content'), h1: h1s, headings: heads, canonical: attr(canonTag, 'href'), metaRobots,
    words: text ? text.split(' ').length : 0, text, contentHash: sha1(text),
    jsonLdTypes: ld.map((n) => [].concat(n['@type']).join('+')), jsonLdNodes: ld, jsonLdErrors: ldErrors,
    imgCount: imgs.length, imgMissingAlt: imgs.filter((i) => !/\balt="[^"]+"/i.test(i)).length,
    linksOut: [...links],
  };
}

async function build(base, opts) {
  const o = opts || {};
  const origin = (o.origin || base).replace(/\/$/, '');
  const sm = await request(base + '/sitemap.xml');
  if (sm.status !== 200) throw new Error(`sitemap.xml returned HTTP ${sm.status}`);
  const locs = [...sm.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => decode(m[1]));
  const sitemapPaths = locs.map((l) => { try { return new URL(l).pathname.replace(/(.)\/$/, '$1'); } catch (e) { return l; } });
  const lastmods = {}; for (const m of sm.body.matchAll(/<url>\s*<loc>\s*([^<]+?)\s*<\/loc>(?:\s*<lastmod>\s*([^<]+?)\s*<\/lastmod>)?/g)) { try { lastmods[new URL(decode(m[1])).pathname.replace(/(.)\/$/, '$1')] = m[2] || null; } catch (e) { /* skip */ } }
  const robots = await request(base + '/robots.txt');
  const pages = {}; const queue = sitemapPaths.slice(); const seen = new Set(); const nonOk = [];
  while (queue.length && seen.size < 300) {
    const p = queue.shift(); if (seen.has(p)) continue; seen.add(p);
    let r; try { r = await request(base + p); } catch (e) { nonOk.push({ path: p, status: 0, error: e.message }); continue; }
    const xRobots = String(r.headers['x-robots-tag'] || '').toLowerCase();
    if (r.status !== 200) { nonOk.push({ path: p, status: r.status, location: r.headers.location || null }); continue; }
    if (!/text\/html/i.test(r.headers['content-type'] || '')) continue;
    const info = parsePage(r.body, p, origin);
    info.status = 200; info.xRobots = xRobots; info.inSitemap = sitemapPaths.includes(p);
    info.indexable = !/noindex/.test(info.metaRobots) && !/noindex/.test(xRobots);
    pages[p] = info;
    for (const l of info.linksOut) if (!seen.has(l) && !queue.includes(l) && !/^\/(admin|images|css|js|uploads|documents)(\/|$)/.test(l) && !/\.[a-z0-9]{2,4}$/i.test(l)) queue.push(l);
  }
  // inbound links
  for (const p of Object.keys(pages)) pages[p].linksIn = 0;
  for (const [p, info] of Object.entries(pages)) for (const l of info.linksOut) if (l !== p && pages[l]) pages[l].linksIn++;
  return { base, origin, builtAt: new Date().toISOString(), sitemapPaths, sitemapLastmod: lastmods, robotsTxt: robots.status === 200 ? robots.body : null, robotsStatus: robots.status, pages, nonOk };
}

// Compact (no body text) form for snapshots on disk.
function compact(inv) {
  const pages = {};
  for (const [p, i] of Object.entries(inv.pages)) pages[p] = { title: i.title, description: i.description, h1: i.h1, canonical: i.canonical, indexable: i.indexable, words: i.words, jsonLdTypes: i.jsonLdTypes, linksIn: i.linksIn, linksOut: i.linksOut.length, contentHash: i.contentHash, imgMissingAlt: i.imgMissingAlt, inSitemap: i.inSitemap };
  return { builtAt: inv.builtAt, sitemapPaths: inv.sitemapPaths, pages, nonOk: inv.nonOk };
}

module.exports = { build, parsePage, compact, strip };
