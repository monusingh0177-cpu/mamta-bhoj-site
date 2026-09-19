// Tiny JSON-file data store. No external dependencies on purpose, so this
// project runs with just `node server.js` on any host that has Node.js —
// no npm install step required.
'use strict';
const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('./persist-paths');

function filePath(name) {
  return path.join(DATA_DIR, name + '.json');
}

function readJSON(name, fallback) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function writeJSON(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // write to a temp file then rename, so a crash mid-write never corrupts
  // the real file (important since this is the site's only "database").
  const tmp = filePath(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath(name));
}

// --- generic collection helpers (products, gallery, enquiries) ---

function nextId(rows) {
  return rows.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
}

function listCollection(name) {
  return readJSON(name, []);
}

function saveCollection(name, rows) {
  writeJSON(name, rows);
}

function insertRow(name, row) {
  const rows = listCollection(name);
  const withId = Object.assign({ id: nextId(rows) }, row);
  rows.push(withId);
  saveCollection(name, rows);
  return withId;
}

function updateRow(name, id, patch) {
  const rows = listCollection(name);
  const idx = rows.findIndex((r) => String(r.id) === String(id));
  if (idx === -1) return null;
  rows[idx] = Object.assign({}, rows[idx], patch);
  saveCollection(name, rows);
  return rows[idx];
}

function deleteRow(name, id) {
  const rows = listCollection(name);
  const next = rows.filter((r) => String(r.id) !== String(id));
  saveCollection(name, next);
  return next.length !== rows.length;
}

function getRow(name, id) {
  return listCollection(name).find((r) => String(r.id) === String(id)) || null;
}

// --- key/value site content ---

function getContent() {
  return readJSON('content', {});
}

function saveContent(obj) {
  const current = getContent();
  writeJSON('content', Object.assign({}, current, obj));
}

module.exports = {
  readJSON,
  writeJSON,
  listCollection,
  saveCollection,
  insertRow,
  updateRow,
  deleteRow,
  getRow,
  getContent,
  saveContent,
};
