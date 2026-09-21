'use strict';
const querystring = require('querystring');

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12MB — enough for a couple of base64 photo uploads

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseForm(req) {
  const buf = await readBody(req);
  const contentType = req.headers['content-type'] || '';
  const raw = buf.toString('utf8');
  if (contentType.includes('application/json')) {
    return raw ? JSON.parse(raw) : {};
  }
  // default: application/x-www-form-urlencoded
  return querystring.parse(raw);
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

module.exports = { readBody, parseForm, escapeHtml, sendHtml, redirect, slugify, MAX_BODY_BYTES };
