'use strict';
// Google Search Console client (OAuth 2.0 refresh-token flow, no dependencies): Search Analytics (reporting),
// Sitemaps (submission) and URL Inspection (status monitoring only; it never requests a crawl).
// Every failure carries a `kind` so a caller can tell "bad credentials" from "no access to the property", a rate limit,
// an outage, and (separately, in run.js) a healthy account that simply has no traffic yet.
const path = require('path');
const { requestRetry, sha1, readJson, writeJson, ensureDir } = require('./util');

class GscError extends Error { constructor(msg, status, kind) { super(msg); this.status = status; this.kind = kind || 'api_error'; } }

// What a person should do about each failure kind. Never contains a credential value.
const REMEDY = {
  not_configured: 'Optional: create an OAuth client in Google Cloud, enable the Search Console API, authorise the account that owns the property once, and add AUTOPILOT_GOOGLE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN to /etc/mamta-autopilot/autopilot.env (chmod 600). Until then the autopilot stays in safe report-only mode and Search Console sections are empty.',
  auth_invalid_client: 'Google rejected the OAuth client (invalid_client). Check AUTOPILOT_GOOGLE_CLIENT_ID and _CLIENT_SECRET belong to the same OAuth client and that it has not been deleted.',
  auth_invalid: 'The refresh token was rejected (invalid_grant): it was revoked or expired (tokens for apps in Testing status expire after 7 days). Re-authorise the Google account, store the new AUTOPILOT_GOOGLE_REFRESH_TOKEN, and publish the OAuth consent screen if it is still in Testing.',
  auth_error: 'Google refused the token request. Re-check the three OAuth values and the OAuth client type.',
  no_access: 'The authorised Google account has no (or only unverified) access to the configured property. Add it as an owner/full user in Search Console, or correct AUTOPILOT_GSC_SITE. Submitting a sitemap also needs the webmasters (not read-only) scope.',
  not_found: 'The property was not found. Check AUTOPILOT_GSC_SITE (for a domain property use sc-domain:example.com; for a URL-prefix property use the exact URL with a trailing slash).',
  quota: 'Search Console rate/quota limit reached. The autopilot already caches results and spaces requests; it will retry on the next scheduled run. No action needed unless it persists for days.',
  network: 'Could not reach Google (network error or timeout). Usually temporary; check the server can make outbound HTTPS requests if it persists.',
  api_error: 'The Search Console API returned an error. Usually temporary; if it persists for days, check the Google Cloud project has the Search Console API enabled.',
};

function create(cfg, cacheDir) {
  const g = cfg.google;
  let token = null;
  const configured = () => Boolean(g.clientId && g.clientSecret && g.refreshToken);

  async function accessToken() {
    if (!configured()) throw new GscError('Google OAuth is not configured (AUTOPILOT_GOOGLE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN)', 0, 'not_configured');
    if (token && token.exp > Date.now() + 60000) return token.value;
    const body = new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: 'refresh_token' }).toString();
    let r;
    try { r = await requestRetry(g.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); }
    catch (e) { throw new GscError(`OAuth token request failed: ${e.message}`, 0, 'network'); }
    let j = {}; try { j = JSON.parse(r.body); } catch (e) { /* ignore */ }
    if (r.status !== 200 || !j.access_token) {
      const kind = r.status === 429 ? 'quota' : r.status >= 500 ? 'api_error' : j.error === 'invalid_grant' ? 'auth_invalid' : j.error === 'invalid_client' ? 'auth_invalid_client' : 'auth_error';
      throw new GscError(`OAuth token refresh failed (HTTP ${r.status}${j.error ? ' ' + j.error : ''})`, r.status, kind);
    }
    token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return token.value;
  }

  async function call(url, opts, retry) {
    const t = await accessToken();
    let r;
    try { r = await requestRetry(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}) }), retry); }
    catch (e) { throw new GscError(`Search Console API request failed: ${e.message}`, 0, 'network'); }
    let j = null; try { j = r.body ? JSON.parse(r.body) : null; } catch (e) { j = null; }
    if (r.status < 200 || r.status >= 300) {
      const kind = r.status === 401 ? 'auth_invalid' : r.status === 403 ? 'no_access' : r.status === 404 ? 'not_found' : r.status === 429 ? 'quota' : r.status >= 500 ? 'api_error' : 'api_error';
      throw new GscError(`Search Console API HTTP ${r.status}${j && j.error && j.error.message ? ': ' + String(j.error.message).slice(0, 160) : ''}`, r.status, kind);
    }
    return j || {};
  }

  const siteUrl = encodeURIComponent(cfg.gscSite);

  // Cheap, read-only health check of the whole chain: credentials -> token -> access to THIS property.
  // Returns { ok, status, detail, remedy, permissionLevel }. It never throws and never includes a credential value.
  async function verify() {
    const fail = (e) => ({ ok: false, status: e.kind || 'api_error', detail: e.message, remedy: REMEDY[e.kind] || REMEDY.api_error });
    if (!configured()) return { ok: false, status: 'not_configured', detail: 'OAuth not configured', remedy: REMEDY.not_configured };
    try {
      const j = await call(`${g.apiBase}/sites/${siteUrl}`, { method: 'GET' });
      const level = j.permissionLevel || null;
      if (level === 'siteUnverifiedUser') return { ok: false, status: 'no_access', detail: `the account only has unverified access to ${cfg.gscSite}`, remedy: REMEDY.no_access, permissionLevel: level };
      return { ok: true, status: 'ok', detail: `access to ${cfg.gscSite}${level ? ' (' + level + ')' : ''}`, remedy: '', permissionLevel: level };
    } catch (e) { return fail(e); }
  }

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
    const j = await call(`${g.inspectBase}/urlInspection/index:inspect`, { method: 'POST', body: JSON.stringify({ inspectionUrl: url, siteUrl: cfg.gscSite }) }, { retries: 0 }); // quota-limited status check: never retried
    const r = (j.inspectionResult || {}).indexStatusResult || {};
    return { verdict: r.verdict || null, coverageState: r.coverageState || null, indexingState: r.indexingState || null, robotsTxtState: r.robotsTxtState || null, pageFetchState: r.pageFetchState || null, lastCrawlTime: r.lastCrawlTime || null, googleCanonical: r.googleCanonical || null, userCanonical: r.userCanonical || null };
  }

  return { configured, accessToken, verify, query, submitSitemap, inspect };
}

module.exports = { create, GscError, REMEDY };
