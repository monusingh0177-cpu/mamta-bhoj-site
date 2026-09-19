// Saves a base64 data: URL (produced client-side by main.js via FileReader)
// to disk under public/uploads/<subdir>/. Avoids needing a multipart/form-data
// parser or the multer dependency, which keeps this project install-free.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { UPLOADS_DIR } = require('./persist-paths');

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function saveDataUrlImage(dataUrl, subdir) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const ext = EXT_BY_MIME[mime];
  if (!ext) return null;
  const buffer = Buffer.from(match[2], 'base64');
  const dir = path.join(UPLOADS_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${subdir}/${filename}`;
}

function deleteUpload(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const full = path.join(UPLOADS_DIR, publicPath.replace(/^\/uploads\//, ''));
  fs.unlink(full, () => {});
}

module.exports = { saveDataUrlImage, deleteUpload };
