'use strict';
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const { Router } = require('./lib/router');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { UPLOADS_DIR, PERSIST_DIR, bootstrap } = require('./lib/persist-paths');

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

function tryServeStatic(req, res, pathname) {
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

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': pathname.startsWith('/uploads/') ? 'public, max-age=3600' : 'public, max-age=86400',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const router = new Router();
router.routes = [...publicRoutes.routes, ...adminRoutes.routes];

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    if (tryServeStatic(req, res, pathname)) return;

    const match = router.match(req.method, pathname);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Not Found</title><body style="font-family:sans-serif;padding:60px;text-align:center;"><h1>404</h1><p>Page not found. <a href="/">Go home</a></p></body>'
      );
      return;
    }

    await match.handler(req, res, match.params, parsed.query);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Server Error</title><body style="font-family:sans-serif;padding:60px;text-align:center;"><h1>Something went wrong</h1><p>Please try again in a moment.</p></body>'
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
