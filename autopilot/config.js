'use strict';
// Configuration: defaults < env file < process environment. Secrets are only ever read from the environment or a
// root-readable env file (never from the repository) and are registered with the log redactor.
const fs = require('fs');
const path = require('path');
const { registerSecrets } = require('./lib/util');

const REPO_DIR = path.resolve(__dirname, '..');
const DEFAULT_ENV_FILE = '/etc/mamta-autopilot/autopilot.env';

function parseEnvFile(file) {
  const out = {};
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const flag = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

function loadConfig(overrides) {
  const envFile = (process.env.AUTOPILOT_ENV_FILE || DEFAULT_ENV_FILE);
  let fileEnv = {}; let envFileUsed = null; let envFileWarning = null;
  if (envFile && fs.existsSync(envFile)) {
    fileEnv = parseEnvFile(envFile); envFileUsed = envFile;
    try { if (fs.statSync(envFile).mode & 0o044) envFileWarning = `${envFile} is readable by group/other: run chmod 600 on it`; } catch (e) { /* ignore */ }
  }
  const env = Object.assign({}, fileEnv, process.env, overrides || {});
  registerSecrets(env);
  const SITE_ORIGIN = (env.AUTOPILOT_SITE_ORIGIN || 'https://devmamflourishfoods.com').replace(/\/$/, '');
  const retention = Math.max(90, int(env.AUTOPILOT_RETENTION_DAYS, 120));
  return {
    repoDir: path.resolve(env.AUTOPILOT_REPO_DIR || REPO_DIR),
    stateDir: path.resolve(env.AUTOPILOT_STATE_DIR || '/var/lib/mamta-autopilot'),
    envFileUsed, envFileWarning,
    siteOrigin: SITE_ORIGIN,
    // where pages are fetched from (inventory, IndexNow key check): the live site by default
    fetchBase: (env.AUTOPILOT_FETCH_BASE || SITE_ORIGIN).replace(/\/$/, ''),
    gscSite: env.AUTOPILOT_GSC_SITE || 'sc-domain:devmamflourishfoods.com',
    google: {
      clientId: env.AUTOPILOT_GOOGLE_CLIENT_ID || '', clientSecret: env.AUTOPILOT_GOOGLE_CLIENT_SECRET || '', refreshToken: env.AUTOPILOT_GOOGLE_REFRESH_TOKEN || '',
      tokenUrl: env.AUTOPILOT_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      apiBase: (env.AUTOPILOT_GSC_API_BASE || 'https://www.googleapis.com/webmasters/v3').replace(/\/$/, ''),
      inspectBase: (env.AUTOPILOT_GSC_INSPECT_BASE || 'https://searchconsole.googleapis.com/v1').replace(/\/$/, ''),
    },
    indexnowEndpoint: env.AUTOPILOT_INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow',
    // report = audit + report only. propose = additionally prepare validated patches on a separate git branch
    // (never on the production branch). Autonomous publishing (merge/push/restart) is NOT part of this build:
    // asking for publish=auto is reported as a stop condition.
    mode: /^propose$/i.test(env.AUTOPILOT_MODE || '') ? 'propose' : 'report',
    publish: /^auto$/i.test(env.AUTOPILOT_PUBLISH || '') ? 'auto' : 'branch',
    ai: { mode: (env.AUTOPILOT_AI_MODE || 'none').toLowerCase(), baseUrl: env.AUTOPILOT_AI_BASE_URL || '', model: env.AUTOPILOT_AI_MODEL || '', apiKey: env.AUTOPILOT_AI_API_KEY || '', cliPath: env.AUTOPILOT_CLAUDE_CLI || 'claude' },
    limits: { pagesPerDay: int(env.AUTOPILOT_MAX_PAGES_PER_DAY, 2), newPagesPer7Days: int(env.AUTOPILOT_MAX_NEW_PAGES_PER_7_DAYS, 1), cooldownDays: int(env.AUTOPILOT_COOLDOWN_DAYS, 14), minScore: int(env.AUTOPILOT_MIN_SCORE, 40), inspectPerRun: int(env.AUTOPILOT_INSPECT_PER_RUN, 10) },
    pm2Check: flag(env.AUTOPILOT_PM2_CHECK, false),         // read-only `pm2 jlist` in the smoke test; the autopilot never restarts anything
    pm2App: env.AUTOPILOT_PM2_APP || 'mamta-bhoj',
    dataDir: env.AUTOPILOT_DATA_DIR ? path.resolve(env.AUTOPILOT_DATA_DIR) : null, // production data/ copied (read-only) into previews
    gates: { syntax: true, preview: true, hardCheck: flag(env.AUTOPILOT_GATE_HARDCHECK, true), enquiry: flag(env.AUTOPILOT_GATE_ENQUIRY, true) },
    retentionDays: retention,
    alertWebhook: env.AUTOPILOT_ALERT_WEBHOOK || '',
    timezone: env.AUTOPILOT_TZ || 'Asia/Kolkata',
    now: env.AUTOPILOT_NOW && !Number.isNaN(Date.parse(env.AUTOPILOT_NOW)) ? new Date(env.AUTOPILOT_NOW) : null, // tests only
  };
}

module.exports = { loadConfig, REPO_DIR, DEFAULT_ENV_FILE };
