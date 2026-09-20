'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cache-busting for static assets. public/css/style.css and public/js/*.js
// are served with a 24h Cache-Control (see server.js), so a browser that
// visited before a deploy can keep serving a stale, mismatched file for up
// to a day after new HTML ships that expects the new CSS/JS — that's what
// made the header logo render at full, unstyled size right after a deploy,
// until a hard refresh cleared it. With this site now carrying much bigger
// visual changes per deploy, that mismatch is only more visible.
// Appending a short content hash as a query string gives each version its
// own URL, so a changed file is fetched immediately regardless of the
// browser's cache lifetime, while an unchanged file keeps its old URL (and
// therefore its cache) across deploys.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const cache = new Map();

function assetVersion(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  let v;
  try {
    const buf = fs.readFileSync(path.join(PUBLIC_DIR, relPath));
    v = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  } catch (err) {
    v = String(Date.now()); // file missing at boot — still bust the cache
  }
  cache.set(relPath, v);
  return v;
}

function assetUrl(relPath) {
  return `${relPath}?v=${assetVersion(relPath)}`;
}

module.exports = { assetUrl };
