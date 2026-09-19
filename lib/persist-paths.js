// Resolves where the site's data (JSON "database") and uploaded photos
// actually live on disk, and seeds that location on first boot.
//
// Why this exists: most affordable Node hosts (Render, Railway, etc.) give
// your app an *ephemeral* filesystem by default — anything written locally
// gets wiped on every restart/redeploy/sleep-wake cycle. Since this project
// has no external database and stores everything as flat JSON files plus
// uploaded photos on disk, that would silently erase every admin edit,
// enquiry and uploaded photo. The fix on those hosts is to attach a small
// persistent disk/volume and point this app at it with one environment
// variable:
//
//   PERSIST_DIR=/var/data     (or wherever the host mounts your disk)
//
// When PERSIST_DIR is set, data/ and uploads/ live under it instead of the
// project folder, and on first boot (empty disk) this module copies the
// project's bundled starter content into it once, so the site launches
// with its real homepage text, products and default admin login instead of
// blank pages. After that, every read/write happens on the persistent
// disk and survives restarts.
//
// When PERSIST_DIR is NOT set (plain local dev, or a VPS where the whole
// project folder is already a normal persistent disk — see README section
// 3), behaviour is unchanged: data/ and public/uploads/ next to the code.
'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const SEED_DATA_DIR = path.join(PROJECT_ROOT, 'data');
const SEED_UPLOADS_DIR = path.join(PROJECT_ROOT, 'public', 'uploads');

const PERSIST_DIR = process.env.PERSIST_DIR ? path.resolve(process.env.PERSIST_DIR) : null;
const DATA_DIR = PERSIST_DIR ? path.join(PERSIST_DIR, 'data') : SEED_DATA_DIR;
const UPLOADS_DIR = PERSIST_DIR ? path.join(PERSIST_DIR, 'uploads') : SEED_UPLOADS_DIR;

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function isEmptyDir(dir) {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
}

function bootstrap() {
  if (!PERSIST_DIR) return;
  if (isEmptyDir(DATA_DIR)) {
    console.log(`[persist-paths] Seeding ${DATA_DIR} from bundled starter data (first boot on this disk).`);
    copyDirSync(SEED_DATA_DIR, DATA_DIR);
  }
  if (isEmptyDir(UPLOADS_DIR)) {
    copyDirSync(SEED_UPLOADS_DIR, UPLOADS_DIR);
  }
}

module.exports = { PERSIST_DIR, DATA_DIR, UPLOADS_DIR, bootstrap };
