'use strict';
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const { Router } = require('./lib/router');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { UPLOADS_DIR, PERSIST_DIR, bootstrap } = require('./lib/persist-paths');
const { SITE_ORIGIN, CANONICAL_HOST } = require('./lib/seo');
const { assetUrl } = require('./lib/asset-version');

bootstrap();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

// Root-level icon URLs that crawlers and browsers request by convention; they
// are served from the images folder (nothing else outside the whitelist below
// is ever served from the project root).
const ROOT_ALIASES = {
  '/favicon.ico': '/images/favicon.ico',
  '/apple-touch-icon.png': '/images/apple-touch-icon.png',
};

// Text assets worth compressing (images/PDFs are already compressed).
const COMPRESSIBLE_EXT = new Set(['.css', '.js', '.svg']);
const COMPRESSIBLE_TYPE = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/i;
const encodedCache = new Map(); // `${enc}:${filePath}` -> { stamp, buf }

// Brotli when the client offers it, otherwise gzip, otherwise nothing.
function pickEncoding(req) {
  const offered = String(req.headers['accept-encoding'] || '').toLowerCase().split(',').map((x) => x.trim());
  const accepts = (name) => offered.some((x) => x === name || (x.startsWith(name + ';') && !/q=0(\.0+)?$/.test(x)));
  if (accepts('br')) return 'br';
  if (accepts('gzip')) return 'gzip';
  return null;
}

function encode(buf, enc, quality) {
  if (enc === 'br') {
    return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  }
  return zlib.gzipSync(buf, { level: 9 });
}

// Cache lifetimes: CSS/JS are fingerprinted (?v=<hash>, see lib/asset-version.js).
// Only a request whose ?v= equals the file's CURRENT hash is cached for a year
// (immutable); any other request, including a stale or made-up ?v=, keeps the
// one-day lifetime. Images/documents change rarely and are not fingerprinted.
// This function is only used for static files; HTML and other dynamic responses
// never receive a long-lived Cache-Control header from it.
function cacheControlFor(pathname, versioned) {
  if (pathname.startsWith('/uploads/')) return 'public, max-age=3600';
  if (versioned && /^\/(css|js)\//.test(pathname)) return 'public, max-age=31536000, immutable';
  if (/^\/images\//.test(pathname)) return 'public, max-age=604800';
  return 'public, max-age=86400';
}

function tryServeStatic(req, res, pathname, query) {
  pathname = ROOT_ALIASES[pathname] || pathname;
  // Only ever serve files that live under /css, /js, /images, /documents or
  // /uploads — never let a request path escape the public/ (or persistent
  // uploads) directory.
  if (!/^\/(css|js|images|documents|uploads)\//.test(pathname)) return false;
  // Uploaded photos are served from UPLOADS_DIR, which is redirected to a
  // mounted persistent disk when PERSIST_DIR is set (see lib/persist-paths.js)
  // — everything else (css/js/images) always ships from the deployed code
  // itself. The prefix must be stripped from the URL (always forward-slash)
  // *before* normalizing — path.normalize() switches to backslashes on
  // Windows, which would otherwise break a forward-slash prefix strip.
  const isUpload = pathname.startsWith('/uploads/');
  const baseDir = isUpload ? UPLOADS_DIR : PUBLIC_DIR;
  const relPath = isUpload ? pathname.slice('/uploads/'.length) : pathname.slice(1);
  const safeRelPath = path.normalize(relPath).replace(/^([.]{2}[/\\])+/, '');
  const filePath = path.join(baseDir, safeRelPath);
  if (!filePath.startsWith(baseDir)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControlFor(pathname, Boolean(query && query.v) && /^\/(css|js)\//.test(pathname) && assetUrl(pathname) === `${pathname}?v=${query.v}`),
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
  };
  const compressible = COMPRESSIBLE_EXT.has(ext) && stat.size > 1024;
  if (compressible) headers.Vary = 'Accept-Encoding';

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  const enc = compressible ? pickEncoding(req) : null;
  if (enc) {
    const key = `${enc}:${filePath}`;
    let hit = encodedCache.get(key);
    if (!hit || hit.stamp !== etag) {
      hit = { stamp: etag, buf: encode(fs.readFileSync(filePath), enc, 11) };
      encodedCache.set(key, hit);
    }
    headers['Content-Encoding'] = enc;
    headers['Content-Length'] = hit.buf.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : hit.buf);
    return true;
  }

  if (req.method === 'HEAD') {
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    res.end();
    return true;
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// Baseline security headers on every response (static, dynamic and redirects).
// HSTS is only sent when the request really arrived over HTTPS (behind the proxy:
// X-Forwarded-Proto: https); it never includes subdomains or preload.
// No Content-Security-Policy is set here on purpose: the site uses inline styles
// and a third-party font stylesheet, so a policy needs its own testing.
function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

// Response handling for dynamic routes. Handlers keep calling
// res.writeHead(...)/res.end(body); this wrapper holds the head until the body is
// known, then:
//  * public HTML (GET/HEAD, 200, no cookies, not /admin) gets a weak content-hash ETag,
//    answers If-None-Match with 304, and carries "Cache-Control: no-cache" (always
//    revalidate, never served stale as fresh); /admin responses get "no-store";
//  * text bodies over 1 KB are compressed with Brotli or gzip when the client accepts
//    it (the ~75 KB home page becomes ~10 KB).
// Redirects, empty bodies and anything already encoded pass through untouched. A reverse
// proxy that also compresses leaves Content-Encoding responses alone.
function enableResponseHandling(req, res, pathname) {
  const writeHead = res.writeHead;
  const end = res.end;
  const enc = pickEncoding(req);
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const readOnly = req.method === 'GET' || req.method === 'HEAD';
  let status = 200;
  let headers = null;
  res.writeHead = function (s, h) {
    status = s;
    headers = Object.assign({}, h);
    return this;
  };
  res.end = function (chunk, encoding, cb) {
    if (headers) {
      const type = String(headers['Content-Type'] || headers['content-type'] || '');
      const body = chunk == null || typeof chunk === 'function' ? null : Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
      const isHtml = /^text\/html/i.test(type);
      const hasCookie = Boolean(headers['Set-Cookie'] || headers['set-cookie'] || res.getHeader('set-cookie'));
      if (isHtml && body) {
        if (!headers['Cache-Control'] && !res.getHeader('cache-control')) headers['Cache-Control'] = isAdmin ? 'no-store' : 'no-cache';
        if (readOnly && status === 200 && !isAdmin && !hasCookie) {
          const tag = `W/"${crypto.createHash('sha1').update(body).digest('base64url')}"`;
          headers.ETag = tag;
          const offered = String(req.headers['if-none-match'] || '').split(',').map((x) => x.trim());
          if (offered.includes(tag) || offered.includes('*')) {
            headers.Vary = 'Accept-Encoding';
            delete headers['Content-Type'];
            writeHead.call(res, 304, headers);
            return end.call(res);
          }
        }
      }
      if (body && COMPRESSIBLE_TYPE.test(type)) headers.Vary = 'Accept-Encoding';
      if (enc && body && body.length > 1024 && COMPRESSIBLE_TYPE.test(type) && !headers['Content-Encoding'] && !res.getHeader('content-encoding')) {
        const packed = enc === 'br' ? encode(body, 'br', 4) : zlib.gzipSync(body, { level: 6 });
        headers['Content-Encoding'] = enc;
        headers['Content-Length'] = packed.length;
        writeHead.call(res, status, headers);
        return end.call(res, packed);
      }
      writeHead.call(res, status, headers);
      headers = null;
    }
    return end.call(res, chunk, encoding, cb);
  };
}

const router = new Router();
router.routes = [...publicRoutes.routes, ...adminRoutes.routes];

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(req, res);
    // One preferred hostname: www.<domain> permanently redirects to the
    // canonical https apex, preserving path and query. The target host can
    // never match this rule, so it cannot loop. (http->https is handled by
    // the reverse proxy, with an app-level fallback below; the www rule always lands
    // on https regardless.)
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    if (reqHost === `www.${CANONICAL_HOST}` && req.url.startsWith('/')) {
      const keepMethod = req.method !== 'GET' && req.method !== 'HEAD';
      res.writeHead(keepMethod ? 308 : 301, { Location: SITE_ORIGIN + req.url });
      res.end();
      return;
    }

    // http -> https for the canonical host (single hop). Only acts when the proxy says
    // the client used plain http (X-Forwarded-Proto: http); localhost, IPs and other
    // hosts are never redirected, so local testing is unaffected.
    const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (fwdProto === 'http' && reqHost === CANONICAL_HOST && req.url.startsWith('/')) {
      const keepMethod = req.method !== 'GET' && req.method !== 'HEAD';
      res.writeHead(keepMethod ? 308 : 301, { Location: SITE_ORIGIN + req.url });
      res.end();
      return;
    }

    // HEAD is answered by the matching GET route; Node sends the headers and
    // omits the body automatically for HEAD responses.
    const routeMethod = req.method === 'HEAD' ? 'GET' : req.method;

    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    if (tryServeStatic(req, res, pathname, parsed.query)) return;

    enableResponseHandling(req, res, pathname);

    // Admin/login pages are private: keep them out of search results even if
    // a crawler ignores robots.txt (the admin layout also carries a noindex meta).
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    // Trailing-slash variants (/about/) 301 to the slash-less canonical page,
    // but only when that page really exists, so unknown URLs still 404.
    if (pathname.length > 1 && pathname.endsWith('/') && routeMethod === 'GET') {
      const bare = pathname.replace(/\/+$/, '');
      if (bare && router.match(routeMethod, bare)) {
        res.writeHead(301, { Location: bare + (parsed.search || '') });
        res.end();
        return;
      }
    }

    const match = router.match(routeMethod, pathname);
    if (!match) {
      // Branded 404 (noindex, real 404 status) with links back into the site;
      // falls back to a bare page if rendering ever fails.
      let notFoundHtml;
      try {
        notFoundHtml = publicRoutes.renderNotFound();
      } catch (err) {
        notFoundHtml =
          '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not Found</title><body style="font-family:sans-serif;padding:60px;text-align:center;"><h1>404</h1><p>Page not found. <a href="/">Go home</a></p></body>';
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(notFoundHtml);
      return;
    }

    await match.handler(req, res, match.params, parsed.query);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Server Error</title><body style="font-family:sans-serif;padding:60px;text-align:center;"><h1>Something went wrong</h1><p>Please try again in a moment.</p></body>'
      );
    }
  }
});

server.listen(PORT, () => {
  console.log(`Mamta Bhoj site running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin/login`);
  if (PERSIST_DIR) {
    console.log(`Persistent storage: ${PERSIST_DIR} (data & uploads survive restarts)`);
  } else {
    console.log('Persistent storage: OFF — data/ and public/uploads/ are local to this process. ' +
      'Set PERSIST_DIR to a mounted disk path before deploying to a host with an ephemeral filesystem (see README section 3).');
  }
});
