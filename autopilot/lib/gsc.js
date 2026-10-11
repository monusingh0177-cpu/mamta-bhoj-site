'use strict';
// Google Search Console client (OAuth 2.0 refresh-token flow, no dependencies): Search Analytics (reporting),
// Sitemaps (submission) and URL Inspection (status monitoring only; it never requests a crawl).
const fs = require('fs');
const path = require('path');
const { request, sha1, readJson, writeJson, ensureDir } = require('./util');

class GscError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

function create(cfg, cacheDir) {
  const g = cfg.google;
  let token = null;
  const configured = () => Boolean(g.clientId && g.clientSecret && g.refreshToken);

  async function accessToken() {
    if (!configured()) throw new GscError('Google OAuth is not configured (AUTOPILOT_GOOGLE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN)', 0);
    if (token && token.exp > Date.now() + 60000) return token.value;
    const body = new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: 'refresh_token' }).toString();
    const r = await request(g.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    let j = {}; try { j = JSON.parse(r.body); } catch (e) { /* ignore */ }
    if (r.status !== 200 || !j.access_token) throw new GscError(`OAuth token refresh failed (HTTP ${r.status}${j.error ? ' ' + j.error : ''})`, r.status);
    token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return token.value;
  }

  async function call(url, opts) {
    const t = await accessToken();
    const r = await request(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}) }));
    let j = null; try { j = r.body ? JSON.parse(r.body) : null; } catch (e) { j = null; }
    if (r.status < 200 || r.status >= 300) throw new GscError(`Search Console API HTTP ${r.status}${j && j.error && j.error.message ? ': ' + String(j.error.message).slice(0, 160) : ''}`, r.status);
    return j || {};
  }

  const siteUrl = encodeURIComponent(cfg.gscSite);

  // rows for a date window, cached for 20 hours so repeated runs never re-query the same window
  async function query({ startDate, endDate, dimensions, rowLimit }) {
    const key = sha1(JSON.stringify([cfg.gscSite, startDate, endDate, dimensions, rowLimit]));
    const file = cacheDir ? path.join(cacheDir, `gsc-${endDate}-${key.slice(0, 12)}.json`) : null;
    if (file) { const c = readJson(file, null); if (c && Date.now() - c.at < 20 * 3600 * 1000) return Object.assign({ cached: true }, c.data); }
    const rows = []; const limit = Math.min(rowLimit || 5000, 25000);
    for (let start = 0; start < 5 * limit; start += limit) {
      const j = await call(`${g.apiBase}/sites/${siteUrl}/searchAnalytics/query`, { method: 'POST', body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: limit, startRow: start, dataState: 'final' }) });
      const part = j.rows || []; rows.push(...part);
      if (part.length < limit) break;
    }
    const data = { rows };
    if (file) { ensureDir(cacheDir); writeJson(file, { at: Date.now(), data }); }
    return data;
  }

  async function submitSitemap(sitemapUrl) {
    await call(`${g.apiBase}/sites/${siteUrl}/sitemaps/${encodeURIComponent(sitemapUrl)}`, { method: 'PUT' });
    return { ok: true };
  }

  async function inspect(url) {
    const j = await call(`${g.inspectBase}/urlInspection/index:inspect`, { method: 'POST', body: JSON.stringify({ inspectionUrl: url, siteUrl: cfg.gscSite }) });
    const r = (j.inspectionResult || {}).indexStatusResult || {};
    return { verdict: r.verdict || null, coverageState: r.coverageState || null, indexingState: r.indexingState || null, robotsTxtState: r.robotsTxtState || null, pageFetchState: r.pageFetchState || null, lastCrawlTime: r.lastCrawlTime || null, googleCanonical: r.googleCanonical || null, userCanonical: r.userCanonical || null };
  }

  return { configured, accessToken, query, submitSitemap, inspect };
}

module.exports = { create, GscError };
