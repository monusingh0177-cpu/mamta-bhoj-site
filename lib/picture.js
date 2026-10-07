'use strict';
const fs = require('fs');
const path = require('path');
const { imgDims } = require('./image-dims');
const { escapeHtml } = require('./http-utils');

// <picture> with a WebP source when a WebP copy of the image exists next to it
// (built by scripts/build-webp.sh), falling back to the original file for browsers
// without WebP and for anything that has no WebP copy (e.g. admin uploads).
//   /images/x/y.jpg      -> /images/x/y.webp
//   /images/x/y-768w.webp is used as a smaller candidate when present
// The <img> keeps the original src, width and height, so layout and crawlers see the
// same image as before. Read-only; missing files simply produce a plain <img>.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const cache = new Map();

function webpSources(src) {
  const clean = String(src || '').split(/[?#]/)[0];
  if (cache.has(clean)) return cache.get(clean);
  let out = null;
  try {
    if (/^\/images\/.+\.(jpe?g|png)$/i.test(clean) && !clean.includes('..')) {
      const base = clean.replace(/\.(jpe?g|png)$/i, '');
      const full = `${base}.webp`;
      if (fs.existsSync(path.join(PUBLIC_DIR, full))) {
        const small = `${base}-768w.webp`;
        out = { full, small: fs.existsSync(path.join(PUBLIC_DIR, small)) ? small : null };
      }
    }
  } catch (err) {
    out = null;
  }
  if (out) cache.set(clean, out);
  return out;
}

// attrs: the remaining attributes of the <img> as an HTML string (alt, class, loading, ...).
// opts.sizes: the `sizes` value for images that have a 768w variant.
function picture(src, attrs, opts) {
  const s = webpSources(src);
  const img = `<img src="${escapeHtml(src)}"${imgDims(src)}${attrs ? ' ' + attrs : ''}>`;
  if (!s) return img;
  const srcset = s.small ? `${s.small} 768w, ${s.full} 1536w` : s.full;
  const sizes = s.small ? ` sizes="${escapeHtml((opts && opts.sizes) || '100vw')}"` : '';
  return `<picture><source type="image/webp" srcset="${srcset}"${sizes}>${img}</picture>`;
}

module.exports = { picture };
