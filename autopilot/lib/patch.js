'use strict';
// Patch objects: { page, kind: 'title'|'description'|'copy', file, find, replace, rationale, confidence }.
// A patch is an exact, single-occurrence text replacement inside an allow-listed source file and inside the
// block that belongs to the target page. Everything is validated before anything is written.
const fs = require('fs');
const path = require('path');
const { checkClaims } = require('./claims');

const ALLOWED_FILES = ['views/b2b-pages.js', 'views/links.js', 'views/product-content.js', 'views/product-detail.js', 'views/guides.js', 'views/guides-more.js', 'views/guides-phase3.js'];
const PROTECTED_RE = /^(data\/|public\/uploads\/|\.env|lib\/(mailer|auth|session|persist-paths|store|admin)[^/]*\.js$|middleware\/|routes\/admin[^/]*\.js$|views\/admin[^/]*\.js$|public\/(js|css)\/admin\.(js|css)$|.*payroll.*)/i;
const KINDS = ['title', 'description', 'copy'];
const HELPER_RE = /\$\{(B2BLINK|PRODLINK|GUIDELINK)\('([a-z0-9-]+)',\s*'([A-Za-z0-9 \/&-]{3,70})'\)\}/g;
const isProtected = (f) => PROTECTED_RE.test(String(f).replace(/\\/g, '/'));

// Where in the source does the text for this page live? Returns { file, start, end, text } or null.
function sourceBlock(repoDir, pagePath) {
  const read = (f) => { try { return fs.readFileSync(path.join(repoDir, f), 'utf8'); } catch (e) { return null; } };
  let m;
  if ((m = pagePath.match(/^\/products\/([a-z0-9-]+)$/))) {
    const f = 'views/product-detail.js'; const s = read(f); if (!s) return null;
    const i = s.search(new RegExp(`^\\s*['"]?${m[1]}['"]?:\\s*\\{`, 'm')); if (i < 0) return null;
    const j = s.indexOf('seoDescription', i); const end = j < 0 ? i + 1500 : s.indexOf('\n', j) + 1; return { file: f, start: i, end, text: s.slice(i, end) };
  }
  const slug = (pagePath.match(/^\/(?:guides\/)?([a-z0-9-]+)$/) || [])[1]; if (!slug) return null;
  for (const f of (pagePath.startsWith('/guides/') ? ['views/guides.js', 'views/guides-more.js', 'views/guides-phase3.js'] : ['views/b2b-pages.js'])) {
    const s = read(f); if (!s) continue; const i = s.search(new RegExp(`slug:\\s*'${slug}'`)); if (i < 0) continue;
    const j = s.indexOf('sections:', i); const end = j < 0 ? i + 2200 : j; return { file: f, start: i, end, text: s.slice(i, end) };
  }
  return null;
}

function knownSlugs(repoDir) {
  const set = new Set();
  for (const f of ['views/b2b-pages.js', 'views/guides.js', 'views/guides-more.js', 'views/guides-phase3.js', 'views/links.js']) {
    try { for (const m of fs.readFileSync(path.join(repoDir, f), 'utf8').matchAll(/slug:\s*'([a-z0-9-]+)'/g)) set.add(m[1]); } catch (e) { /* skip */ }
  }
  for (const p of ['fresh-chakki-atta', 'maida', 'sooji-rava', 'tandoori-atta', 'besan']) set.add(p);
  return set;
}

// -> { ok, errors[], file, absFile, content, index }  (never writes)
function validate(patch, ctx) {
  const errors = []; const p = patch || {};
  const fail = (m) => errors.push(m);
  if (!KINDS.includes(p.kind)) fail(`unsupported kind "${p.kind}"`);
  if (typeof p.page !== 'string' || !p.page.startsWith('/')) fail('page must be a site path');
  const file = String(p.file || '').replace(/\\/g, '/');
  if (!ALLOWED_FILES.includes(file)) fail(`file "${file}" is not an allow-listed SEO source file`);
  if (isProtected(file)) fail(`file "${file}" is protected`);
  if (typeof p.find !== 'string' || p.find.length < 6) fail('find text missing or too short');
  if (typeof p.replace !== 'string' || !p.replace.trim()) fail('replace text missing');
  if (errors.length) return { ok: false, errors };
  const abs = path.join(ctx.repoDir, file);
  let content; try { content = fs.readFileSync(abs, 'utf8'); } catch (e) { return { ok: false, errors: [`cannot read ${file}`] }; }
  const count = content.split(p.find).length - 1;
  if (count !== 1) fail(`find text occurs ${count} times in ${file} (must be exactly 1)`);
  const block = sourceBlock(ctx.repoDir, p.page);
  const index = content.indexOf(p.find);
  if (!block) fail(`no editable source block known for ${p.page}`);
  else if (block.file !== file || index < block.start || index + p.find.length > block.end) fail(`find text is outside the editable block for ${p.page}`);
  if (p.find === p.replace) fail('replace is identical to find');
  if (/[`\\\n\r]/.test(p.replace)) fail('replace contains a backtick, backslash or line break');
  if (/(require\s*\(|eval\s*\(|process\.|<script|<\/|<[a-z]|javascript:|https?:\/\/|\bon[a-z]+\s*=)/i.test(p.replace.replace(HELPER_RE, ''))) fail('replace contains code, markup or a URL');
  // template interpolation is only allowed in the form of the page-link helpers, with a known slug
  const known = ctx.knownSlugs || knownSlugs(ctx.repoDir);
  const withoutHelpers = p.replace.replace(HELPER_RE, (m, helper, slug) => { if (!known.has(slug)) fail(`link to unknown page "${slug}"`); if (!content.includes(helper)) fail(`${helper} is not available in ${file}`); return ' '; });
  if (/\$\{|\}/.test(withoutHelpers) && !/\$\{|\}/.test(p.find)) fail('replace contains template interpolation other than a page-link helper');
  const delta = p.replace.length - p.find.length;
  const maxGrow = p.kind === 'copy' ? 320 : 60;
  if (delta > maxGrow) fail(`replacement grows the text by ${delta} characters (max ${maxGrow})`);
  // rendered title/description lengths are enforced by the preview gate (the text here is only a fragment of a template)
  const claim = checkClaims(withoutHelpers, p.page);
  if (claim.length) fail(`unsupported business claim: ${claim.join('; ')}`);
  return { ok: errors.length === 0, errors, file, abs, content, index };
}

function apply(v, patch) { fs.writeFileSync(v.abs, v.content.slice(0, v.index) + patch.replace + v.content.slice(v.index + patch.find.length)); return { file: v.file, original: v.content }; }
function revert(abs, original) { fs.writeFileSync(abs, original); }

module.exports = { ALLOWED_FILES, PROTECTED_RE, isProtected, sourceBlock, knownSlugs, validate, apply, revert };
