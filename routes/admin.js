'use strict';
const store = require('../lib/store');
const { hashPassword, verifyPassword } = require('../lib/auth');
const { getSession, createSession, destroySession } = require('../lib/session');
const { currentAdmin } = require('../middleware/require-admin');
const { parseForm, sendHtml, redirect, escapeHtml } = require('../lib/http-utils');
const { saveDataUrlImage, deleteUpload } = require('../lib/images');
const { adminLayout, loginPage } = require('../lib/admin-render');
const contentSchema = require('../lib/content-schema');
const views = require('../views/admin');
const { Router } = require('../lib/router');

const router = new Router();

function guarded(title, active, handler) {
  return async (req, res, params, query) => {
    const admin = currentAdmin(req);
    if (!admin) return redirect(res, '/admin/login');
    await handler(req, res, params, query, admin, title, active);
  };
}

function page(title, active, admin, bodyHtml, flash) {
  return adminLayout({ title, active, username: admin.username, bodyHtml, flash });
}

function flashFromQuery(query) {
  if (query && query.saved === '1') return { type: 'success', message: 'Saved successfully.' };
  if (query && query.deleted === '1') return { type: 'success', message: 'Deleted.' };
  return null;
}

// ---------- auth ----------

router.get('/admin/login', async (req, res) => {
  const admin = currentAdmin(req);
  if (admin) return redirect(res, '/admin');
  sendHtml(res, 200, loginPage());
});

router.post('/admin/login', async (req, res) => {
  const body = await parseForm(req);
  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();
  const record = store.readJSON('admin', null);

  if (!record || record.username !== username || !verifyPassword(password, record.passwordHash)) {
    return sendHtml(res, 401, loginPage('Incorrect username or password.'));
  }

  createSession(res, { isAdmin: true, username: record.username });
  redirect(res, '/admin');
});

router.post('/admin/logout', async (req, res) => {
  destroySession(req, res);
  redirect(res, '/admin/login');
});

// ---------- dashboard ----------

router.get(
  '/admin',
  guarded('Dashboard', 'dashboard', async (req, res, params, query, admin) => {
    const products = store.listCollection('products');
    const gallery = store.listCollection('gallery');
    const enquiries = store.listCollection('enquiries');
    const newsletter = store.listCollection('newsletter');
    const body = views.dashboard({
      productCount: products.length,
      galleryCount: gallery.length,
      enquiryCount: enquiries.length,
      unreadCount: enquiries.filter((e) => !e.read).length,
      newsletterCount: newsletter.length,
    });
    sendHtml(res, 200, page('Dashboard', 'dashboard', admin, body));
  })
);

// ---------- site content ----------

router.get(
  '/admin/content',
  guarded('Site Content', 'content', async (req, res, params, query, admin) => {
    const content = store.getContent();
    const body = views.contentForm(contentSchema, content);
    sendHtml(res, 200, page('Site Content', 'content', admin, body, flashFromQuery(query)));
  })
);

router.post(
  '/admin/content',
  guarded('Site Content', 'content', async (req, res, params, query, admin) => {
    const body = await parseForm(req);
    const patch = {};
    contentSchema.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(body, f.key)) {
        patch[f.key] = body[f.key].toString();
      }
    });
    store.saveContent(patch);
    redirect(res, '/admin/content?saved=1');
  })
);

// ---------- products ----------

router.get(
  '/admin/products',
  guarded('Products', 'products', async (req, res, params, query, admin) => {
    const products = store.listCollection('products');
    sendHtml(res, 200, page('Products', 'products', admin, views.productsList(products), flashFromQuery(query)));
  })
);

router.get(
  '/admin/products/new',
  guarded('Add Product', 'products', async (req, res, params, query, admin) => {
    sendHtml(res, 200, page('Add Product', 'products', admin, views.productForm(null)));
  })
);

router.post(
  '/admin/products',
  guarded('Add Product', 'products', async (req, res, params, query, admin) => {
    const body = await parseForm(req);
    const image = saveDataUrlImage(body.image, 'products') || null;
    store.insertRow('products', {
      name: (body.name || '').toString().trim(),
      description: (body.description || '').toString().trim(),
      tags: (body.tags || '')
        .toString()
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      image,
      icon: (body.icon || 'wheat').toString(),
      featured: body.featured === '1',
      sortOrder: parseInt(body.sortOrder, 10) || 0,
    });
    redirect(res, '/admin/products?saved=1');
  })
);

router.get(
  '/admin/products/:id/edit',
  guarded('Edit Product', 'products', async (req, res, params, query, admin) => {
    const product = store.getRow('products', params.id);
    if (!product) return sendHtml(res, 404, page('Not Found', 'products', admin, '<div class="admin-card">Product not found.</div>'));
    sendHtml(res, 200, page('Edit Product', 'products', admin, views.productForm(product)));
  })
);

router.post(
  '/admin/products/:id',
  guarded('Edit Product', 'products', async (req, res, params, query, admin) => {
    const body = await parseForm(req);
    const existing = store.getRow('products', params.id);
    let image = existing ? existing.image : null;
    if (body.image && body.image.toString().startsWith('data:')) {
      const saved = saveDataUrlImage(body.image, 'products');
      if (saved) {
        if (existing && existing.image) deleteUpload(existing.image);
        image = saved;
      }
    } else if (body.image === '') {
      if (existing && existing.image) deleteUpload(existing.image);
      image = null;
    }
    store.updateRow('products', params.id, {
      name: (body.name || '').toString().trim(),
      description: (body.description || '').toString().trim(),
      tags: (body.tags || '')
        .toString()
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      image,
      icon: (body.icon || 'wheat').toString(),
      featured: body.featured === '1',
      sortOrder: parseInt(body.sortOrder, 10) || 0,
    });
    redirect(res, '/admin/products?saved=1');
  })
);

router.post(
  '/admin/products/:id/delete',
  guarded('Products', 'products', async (req, res, params) => {
    const existing = store.getRow('products', params.id);
    if (existing && existing.image) deleteUpload(existing.image);
    store.deleteRow('products', params.id);
    redirect(res, '/admin/products?deleted=1');
  })
);

// ---------- gallery ----------

router.get(
  '/admin/gallery',
  guarded('Gallery', 'gallery', async (req, res, params, query, admin) => {
    const gallery = store.listCollection('gallery');
    sendHtml(res, 200, page('Gallery', 'gallery', admin, views.galleryList(gallery), flashFromQuery(query)));
  })
);

router.get(
  '/admin/gallery/new',
  guarded('Add Photo', 'gallery', async (req, res, params, query, admin) => {
    sendHtml(res, 200, page('Add Photo', 'gallery', admin, views.galleryForm(null)));
  })
);

router.post(
  '/admin/gallery',
  guarded('Add Photo', 'gallery', async (req, res, params, query, admin) => {
    const body = await parseForm(req);
    const image = saveDataUrlImage(body.image, 'gallery') || null;
    store.insertRow('gallery', {
      caption: (body.caption || '').toString().trim(),
      image,
      icon: (body.icon || 'field').toString(),
      sortOrder: parseInt(body.sortOrder, 10) || 0,
    });
    redirect(res, '/admin/gallery?saved=1');
  })
);

router.get(
  '/admin/gallery/:id/edit',
  guarded('Edit Photo', 'gallery', async (req, res, params, query, admin) => {
    const item = store.getRow('gallery', params.id);
    if (!item) return sendHtml(res, 404, page('Not Found', 'gallery', admin, '<div class="admin-card">Photo not found.</div>'));
    sendHtml(res, 200, page('Edit Photo', 'gallery', admin, views.galleryForm(item)));
  })
);

router.post(
  '/admin/gallery/:id',
  guarded('Edit Photo', 'gallery', async (req, res, params) => {
    const body = await parseForm(req);
    const existing = store.getRow('gallery', params.id);
    let image = existing ? existing.image : null;
    if (body.image && body.image.toString().startsWith('data:')) {
      const saved = saveDataUrlImage(body.image, 'gallery');
      if (saved) {
        if (existing && existing.image) deleteUpload(existing.image);
        image = saved;
      }
    } else if (body.image === '') {
      if (existing && existing.image) deleteUpload(existing.image);
      image = null;
    }
    store.updateRow('gallery', params.id, {
      caption: (body.caption || '').toString().trim(),
      image,
      icon: (body.icon || 'field').toString(),
      sortOrder: parseInt(body.sortOrder, 10) || 0,
    });
    redirect(res, '/admin/gallery?saved=1');
  })
);

router.post(
  '/admin/gallery/:id/delete',
  guarded('Gallery', 'gallery', async (req, res, params) => {
    const existing = store.getRow('gallery', params.id);
    if (existing && existing.image) deleteUpload(existing.image);
    store.deleteRow('gallery', params.id);
    redirect(res, '/admin/gallery?deleted=1');
  })
);

// ---------- enquiries ----------

router.get(
  '/admin/enquiries',
  guarded('Enquiries', 'enquiries', async (req, res, params, query, admin) => {
    const enquiries = store.listCollection('enquiries');
    sendHtml(res, 200, page('Enquiries', 'enquiries', admin, views.enquiriesList(enquiries)));
  })
);

router.post(
  '/admin/enquiries/:id/read',
  guarded('Enquiries', 'enquiries', async (req, res, params) => {
    store.updateRow('enquiries', params.id, { read: true });
    redirect(res, '/admin/enquiries');
  })
);

router.post(
  '/admin/enquiries/:id/delete',
  guarded('Enquiries', 'enquiries', async (req, res, params) => {
    store.deleteRow('enquiries', params.id);
    redirect(res, '/admin/enquiries');
  })
);

// ---------- settings ----------

router.get(
  '/admin/settings',
  guarded('Settings', 'settings', async (req, res, params, query, admin) => {
    sendHtml(res, 200, page('Settings', 'settings', admin, views.settingsForm(admin.username)));
  })
);

router.post(
  '/admin/settings',
  guarded('Settings', 'settings', async (req, res, params, query, admin) => {
    const body = await parseForm(req);
    const record = store.readJSON('admin', null);
    const currentPassword = (body.currentPassword || '').toString();

    if (!record || !verifyPassword(currentPassword, record.passwordHash)) {
      return sendHtml(res, 401, page('Settings', 'settings', admin, views.settingsForm(admin.username, 'Current password is incorrect.')));
    }

    const newUsername = (body.username || '').toString().trim() || record.username;
    const newPassword = (body.newPassword || '').toString();
    const updated = {
      username: newUsername,
      passwordHash: newPassword ? hashPassword(newPassword) : record.passwordHash,
    };
    store.writeJSON('admin', updated);
    createSession(res, { isAdmin: true, username: updated.username });
    sendHtml(res, 200, page('Settings', 'settings', { username: updated.username }, views.settingsForm(updated.username), { type: 'success', message: 'Settings updated.' }));
  })
);

module.exports = router;
