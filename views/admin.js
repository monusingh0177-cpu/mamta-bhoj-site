'use strict';
const { escapeHtml } = require('../lib/http-utils');

function dashboard({ productCount, galleryCount, enquiryCount, unreadCount, newsletterCount }) {
  return `
<div class="stat-tiles">
  <div class="stat-tile"><strong>${productCount}</strong><span>Products listed</span></div>
  <div class="stat-tile"><strong>${galleryCount}</strong><span>Gallery photos</span></div>
  <div class="stat-tile"><strong>${enquiryCount}</strong><span>Total enquiries</span></div>
  <div class="stat-tile"><strong>${unreadCount}</strong><span>New enquiries</span></div>
  <div class="stat-tile"><strong>${newsletterCount || 0}</strong><span>Newsletter subscribers</span></div>
</div>
<div class="admin-card">
  <h3 style="margin-bottom:10px;">Quick links</h3>
  <p style="margin-bottom:16px;">Edit the words on your website, swap product or gallery photos, or check enquiries that came in from the Contact page.</p>
  <div class="row-actions">
    <a class="btn btn-primary btn-sm" href="/admin/content">Edit Site Content</a>
    <a class="btn btn-ghost btn-sm" href="/admin/products">Manage Products</a>
    <a class="btn btn-ghost btn-sm" href="/admin/gallery">Manage Gallery</a>
    <a class="btn btn-ghost btn-sm" href="/admin/enquiries">View Enquiries</a>
  </div>
</div>
<div class="admin-card">
  <h3 style="margin-bottom:10px;">Live site</h3>
  <p>Your public website is served from this same app.</p>
  <div class="row-actions" style="margin-top:10px;">
    <a class="btn btn-ghost btn-sm" href="/" target="_blank" rel="noopener">Open Home Page &rarr;</a>
  </div>
</div>`;
}

function contentForm(schema, content) {
  const groups = {};
  schema.forEach((field) => {
    groups[field.group] = groups[field.group] || [];
    groups[field.group].push(field);
  });
  const sections = Object.keys(groups)
    .map((groupName) => {
      const fields = groups[groupName]
        .map((f) => {
          const value = content[f.key] || '';
          if (f.type === 'textarea') {
            return `<div class="field"><label for="${f.key}">${escapeHtml(f.label)}</label><textarea id="${f.key}" name="${f.key}" rows="3">${escapeHtml(value)}</textarea></div>`;
          }
          return `<div class="field"><label for="${f.key}">${escapeHtml(f.label)}</label><input type="text" id="${f.key}" name="${f.key}" value="${escapeHtml(value)}"></div>`;
        })
        .join('');
      return `<div class="admin-card"><h3 style="margin-bottom:14px;">${escapeHtml(groupName)}</h3>${fields}</div>`;
    })
    .join('');
  return `<form method="POST" action="/admin/content">
    ${sections}
    <button type="submit" class="btn btn-primary">Save Changes</button>
  </form>`;
}

function productsList(products) {
  const rows = products
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(
      (p) => `<tr>
        <td>${p.image ? `<img class="thumb" src="${escapeHtml(p.image)}" alt="">` : '<span class="badge badge-read">No photo</span>'}</td>
        <td><strong>${escapeHtml(p.name)}</strong>${p.featured ? ' <span class="badge badge-new">Featured</span>' : ''}<br><span style="font-size:.82rem;color:var(--ink-soft);">${escapeHtml(p.description || '')}</span></td>
        <td>${p.sortOrder ?? ''}</td>
        <td class="row-actions">
          <a class="btn btn-ghost btn-sm" href="/admin/products/${p.id}/edit">Edit</a>
          <form method="POST" action="/admin/products/${p.id}/delete" data-confirm="Delete ${escapeHtml(p.name)}? This can't be undone.">
            <button class="btn btn-danger btn-sm" type="submit">Delete</button>
          </form>
        </td>
      </tr>`
    )
    .join('');
  return `
  <div class="row-actions" style="margin-bottom:18px;"><a class="btn btn-primary" href="/admin/products/new">+ Add Product</a></div>
  <div class="admin-card table-scroll">
    <table>
      <thead><tr><th>Photo</th><th>Product</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No products yet.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function productForm(product) {
  const isEdit = !!product;
  const p = product || { name: '', description: '', tags: [], image: '', icon: 'wheat', featured: false, sortOrder: 0 };
  const action = isEdit ? `/admin/products/${p.id}` : '/admin/products';
  return `<form method="POST" action="${action}" class="admin-card" style="max-width:640px;">
    <div class="field"><label for="name">Product Name</label><input type="text" id="name" name="name" value="${escapeHtml(p.name)}" required></div>
    <div class="field"><label for="description">Description</label><textarea id="description" name="description" rows="3">${escapeHtml(p.description || '')}</textarea></div>
    <div class="field"><label for="tags">Tags (comma-separated)</label><input type="text" id="tags" name="tags" value="${escapeHtml((p.tags || []).join(', '))}" placeholder="Rich in Fibre, High Protein"></div>
    <div class="field">
      <label>Product Photo</label>
      <div class="image-picker">
        <img src="${escapeHtml(p.image || '')}" alt="" style="${p.image ? '' : 'display:none;'}">
        <input type="file" accept="image/*">
        <input type="hidden" name="image" value="${escapeHtml(p.image || '')}">
      </div>
      <p class="help">Used as the product photo. If left empty, an icon is shown instead.</p>
    </div>
    <div class="field">
      <label for="icon">Fallback Icon (used when no photo is set)</label>
      <select id="icon" name="icon">
        <option value="wheat" ${p.icon === 'wheat' ? 'selected' : ''}>Wheat</option>
        <option value="circle" ${p.icon === 'circle' ? 'selected' : ''}>Circle</option>
        <option value="grid" ${p.icon === 'grid' ? 'selected' : ''}>Grid</option>
      </select>
    </div>
    <div class="field"><label for="sortOrder">Display Order (lower shows first)</label><input type="text" id="sortOrder" name="sortOrder" value="${escapeHtml(p.sortOrder ?? 0)}"></div>
    <div class="field">
      <label><input type="checkbox" name="featured" value="1" ${p.featured ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:8px;">Feature this product (highlighted on the Home page)</label>
    </div>
    <div class="row-actions">
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save Product' : 'Add Product'}</button>
      <a class="btn btn-ghost" href="/admin/products">Cancel</a>
    </div>
  </form>`;
}

function galleryList(gallery) {
  const rows = gallery
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(
      (g) => `<tr>
        <td>${g.image ? `<img class="thumb" src="${escapeHtml(g.image)}" alt="">` : '<span class="badge badge-read">Illustration</span>'}</td>
        <td>${escapeHtml(g.caption)}</td>
        <td>${g.sortOrder ?? ''}</td>
        <td class="row-actions">
          <a class="btn btn-ghost btn-sm" href="/admin/gallery/${g.id}/edit">Edit</a>
          <form method="POST" action="/admin/gallery/${g.id}/delete" data-confirm="Delete this gallery photo?">
            <button class="btn btn-danger btn-sm" type="submit">Delete</button>
          </form>
        </td>
      </tr>`
    )
    .join('');
  return `
  <div class="row-actions" style="margin-bottom:18px;"><a class="btn btn-primary" href="/admin/gallery/new">+ Add Photo</a></div>
  <div class="admin-card table-scroll">
    <table>
      <thead><tr><th>Photo</th><th>Caption</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No gallery photos yet — illustrated placeholders are shown on the site.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function galleryForm(item) {
  const isEdit = !!item;
  const g = item || { caption: '', image: '', icon: 'field', sortOrder: 0 };
  const action = isEdit ? `/admin/gallery/${g.id}` : '/admin/gallery';
  return `<form method="POST" action="${action}" class="admin-card" style="max-width:560px;">
    <div class="field"><label for="caption">Caption</label><input type="text" id="caption" name="caption" value="${escapeHtml(g.caption)}" required></div>
    <div class="field">
      <label>Photo</label>
      <div class="image-picker">
        <img src="${escapeHtml(g.image || '')}" alt="" style="${g.image ? '' : 'display:none;'}">
        <input type="file" accept="image/*">
        <input type="hidden" name="image" value="${escapeHtml(g.image || '')}">
      </div>
      <p class="help">If left empty, a themed illustration is shown instead.</p>
    </div>
    <div class="field">
      <label for="icon">Fallback Illustration</label>
      <select id="icon" name="icon">
        <option value="field" ${g.icon === 'field' ? 'selected' : ''}>Wheat Field</option>
        <option value="silo" ${g.icon === 'silo' ? 'selected' : ''}>Storage Silos</option>
        <option value="chakki" ${g.icon === 'chakki' ? 'selected' : ''}>Stone Grinding</option>
        <option value="pack" ${g.icon === 'pack' ? 'selected' : ''}>Packing</option>
      </select>
    </div>
    <div class="field"><label for="sortOrder">Display Order</label><input type="text" id="sortOrder" name="sortOrder" value="${escapeHtml(g.sortOrder ?? 0)}"></div>
    <div class="row-actions">
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save Photo' : 'Add Photo'}</button>
      <a class="btn btn-ghost" href="/admin/gallery">Cancel</a>
    </div>
  </form>`;
}

function enquiriesList(enquiries) {
  const rows = enquiries
    .slice()
    .sort((a, b) => b.id - a.id)
    .map(
      (e) => `<tr class="${e.read ? '' : 'unread'}">
        <td>${e.read ? '<span class="badge badge-read">Read</span>' : '<span class="badge badge-new">New</span>'}</td>
        <td><strong>${escapeHtml(e.name)}</strong><br><a href="tel:${escapeHtml(e.phone)}">${escapeHtml(e.phone)}</a></td>
        <td>${escapeHtml(e.type || 'General Enquiry')}</td>
        <td style="max-width:320px;">${escapeHtml(e.message)}</td>
        <td>${escapeHtml(new Date(e.createdAt).toLocaleString('en-IN'))}</td>
        <td class="row-actions">
          ${e.read ? '' : `<form method="POST" action="/admin/enquiries/${e.id}/read"><button class="btn btn-ghost btn-sm" type="submit">Mark Read</button></form>`}
          <form method="POST" action="/admin/enquiries/${e.id}/delete" data-confirm="Delete this enquiry?"><button class="btn btn-danger btn-sm" type="submit">Delete</button></form>
        </td>
      </tr>`
    )
    .join('');
  return `<div class="admin-card table-scroll">
    <table>
      <thead><tr><th>Status</th><th>Contact</th><th>Type</th><th>Message</th><th>Received</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No enquiries yet.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function settingsForm(username, error) {
  return `
  ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
  <form method="POST" action="/admin/settings" class="admin-card" style="max-width:480px;">
    <h3 style="margin-bottom:14px;">Account</h3>
    <div class="field"><label for="username">Username</label><input type="text" id="username" name="username" value="${escapeHtml(username)}" required></div>
    <div class="field"><label for="currentPassword">Current Password</label><input type="password" id="currentPassword" name="currentPassword" required></div>
    <div class="field"><label for="newPassword">New Password (leave blank to keep current)</label><input type="password" id="newPassword" name="newPassword"></div>
    <button type="submit" class="btn btn-primary">Save</button>
  </form>`;
}

module.exports = {
  dashboard,
  contentForm,
  productsList,
  productForm,
  galleryList,
  galleryForm,
  enquiriesList,
  settingsForm,
};
