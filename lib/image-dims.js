'use strict';
// Intrinsic width/height for locally served images, read once from the file
// header (PNG / JPEG / GIF / WebP; nothing is decoded) and cached. Used to put
// width= and height= on <img> tags so the browser can reserve the right space
// before the image loads (no layout shift). Read-only: it never writes files.
// Unknown, missing or unsupported files return '' so the markup is unchanged.
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./persist-paths');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const cache = new Map();

function readHead(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function jpegSize(file) {
  const d = fs.readFileSync(file);
  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) { i += 1; continue; }
    const marker = d[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: d.readUInt16BE(i + 5), w: d.readUInt16BE(i + 7) };
    }
    i += 2 + d.readUInt16BE(i + 2);
  }
  return null;
}

function sizeOf(file) {
  const head = readHead(file, 32);
  if (head.length >= 24 && head.readUInt32BE(0) === 0x89504e47) return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
  if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) return jpegSize(file);
  if (head.length >= 10 && head.toString('ascii', 0, 3) === 'GIF') return { w: head.readUInt16LE(6), h: head.readUInt16LE(8) };
  if (head.length >= 30 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    const kind = head.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + head.readUIntLE(24, 3), h: 1 + head.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { w: head.readUInt16LE(26) & 0x3fff, h: head.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const b = head.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  }
  return null;
}

// '/images/products/x.jpg' -> ' width="512" height="512"' (leading space included)
function imgDims(src) {
  const key = String(src || '');
  if (cache.has(key)) return cache.get(key);
  let out = '';
  try {
    const clean = key.split(/[?#]/)[0];
    let file = null;
    if (/^\/images\//.test(clean)) file = path.join(PUBLIC_DIR, clean);
    else if (/^\/uploads\//.test(clean)) file = path.join(UPLOADS_DIR, clean.slice('/uploads/'.length));
    if (file && !file.includes('..') && fs.existsSync(file)) {
      const s = sizeOf(file);
      if (s && s.w > 0 && s.h > 0) out = ` width="${s.w}" height="${s.h}"`;
    }
  } catch (err) {
    out = '';
  }
  // Only cache a real answer; a missing file may be uploaded later.
  if (out) cache.set(key, out);
  return out;
}

// { width, height } for the same files, or null (used for og:image dimensions).
function imgSize(src) {
  const m = /width="(\d+)" height="(\d+)"/.exec(imgDims(src));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

module.exports = { imgDims, imgSize };
