'use strict';
const { escapeHtml } = require('./http-utils');
const { logoMark, FONT_LINK, FAVICON_LINK } = require('./render');
const { assetUrl } = require('./asset-version');

const NAV = [
  { href: '/admin', label: 'Dashboard', key: 'dashboard' },
  { href: '/admin/content', label: 'Site Content', key: 'content' },
  { href: '/admin/products', label: 'Products', key: 'products' },
  { href: '/admin/gallery', label: 'Gallery', key: 'gallery' },
  { href: '/admin/enquiries', label: 'Enquiries', key: 'enquiries' },
  { href: '/admin/settings', label: 'Settings', key: 'settings' },
];

function adminLayout({ title, active, username, bodyHtml, flash }) {
  const nav = NAV.map(
    (item) => `<li><a href="${item.href}"${item.key === active ? ' class="active"' : ''}>${item.label}</a></li>`
  ).join('');
  const flashHtml = flash
    ? `<div class="alert alert-${flash.type === 'error' ? 'error' : 'success'}">${escapeHtml(flash.message)}</div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Mamta Bhoj Admin</title>
<meta name="robots" content="noindex">
${FAVICON_LINK}
${FONT_LINK}
<link rel="stylesheet" href="${assetUrl('/css/style.css')}">
<link rel="stylesheet" href="${assetUrl('/css/admin.css')}">
</head>
<body class="admin">
<div class="admin-shell">
  <aside class="admin-sidebar">
    <div class="brand">${logoMark(32)}<span class="brand-name" style="font-size:1rem;">Mamta Bhoj<br><span class="brand-sub">Admin Panel</span></span></div>
    <ul class="admin-nav">${nav}</ul>
  </aside>
  <div class="admin-main">
    <div class="admin-topbar">
      <h1>${escapeHtml(title)}</h1>
      <form method="POST" action="/admin/logout"><span style="font-size:.85rem;color:var(--ink-soft);margin-right:10px;">Signed in as <strong>${escapeHtml(username || '')}</strong></span><button class="btn btn-ghost btn-sm" type="submit">Log out</button></form>
    </div>
    ${flashHtml}
    ${bodyHtml}
  </div>
</div>
<script src="${assetUrl('/js/admin.js')}"></script>
</body>
</html>`;
}

function loginPage(error) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Login · Mamta Bhoj</title>
<meta name="robots" content="noindex">
${FAVICON_LINK}
${FONT_LINK}
<link rel="stylesheet" href="${assetUrl('/css/style.css')}">
<link rel="stylesheet" href="${assetUrl('/css/admin.css')}">
</head>
<body class="admin">
<div class="login-shell">
  <div class="login-card">
    <div class="brand" style="margin-bottom:18px;">${logoMark(38)}<span class="brand-name">Mamta Bhoj</span></div>
    <h1>Admin Sign In</h1>
    <p>Manage site content, products, gallery photos and enquiries.</p>
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/admin/login">
      <div class="field"><label for="username">Username</label><input type="text" id="username" name="username" required autofocus></div>
      <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" required></div>
      <button type="submit" class="btn btn-primary" data-loading-text="Signing In…" style="width:100%;justify-content:center;">Sign In</button>
    </form>
  </div>
</div>
<script src="${assetUrl('/js/admin.js')}"></script>
</body>
</html>`;
}

module.exports = { adminLayout, loginPage };
