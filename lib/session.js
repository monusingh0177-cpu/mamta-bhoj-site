// Minimal cookie-based session store (in-memory). Good enough for a single
// small-business admin account. Sessions reset if the server restarts —
// the employee just logs in again.
'use strict';
const crypto = require('crypto');

const SESSION_COOKIE = 'mb_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const sessions = new Map(); // id -> { data, expires }

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  });
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const id = cookies[SESSION_COOKIE];
  if (!id) return { id: null, data: {} };
  const entry = sessions.get(id);
  if (!entry || entry.expires < Date.now()) {
    sessions.delete(id);
    return { id: null, data: {} };
  }
  return { id, data: entry.data };
}

function createSession(res, data) {
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { data, expires: Date.now() + SESSION_TTL_MS });
  const secure = process.env.FORCE_HTTPS === '1' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  );
  return id;
}

function destroySession(req, res) {
  const { id } = getSession(req);
  if (id) sessions.delete(id);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

module.exports = { getSession, createSession, destroySession, parseCookies };
