// Password hashing using Node's built-in crypto.scrypt (no bcrypt needed —
// keeps this project dependency-free). Format stored: scrypt$<saltHex>$<hashHex>
'use strict';
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(password, salt, 64);
  const stored_buf = Buffer.from(hashHex, 'hex');
  if (stored_buf.length !== hash.length) return false;
  return crypto.timingSafeEqual(hash, stored_buf);
}

module.exports = { hashPassword, verifyPassword };
