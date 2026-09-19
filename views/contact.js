'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');

function renderContact(content, query) {
  let alertHtml = '';
  if (query && query.sent === '1') {
    alertHtml = `<div class="alert alert-success">Thanks — your enquiry has been received. Our team will get back to you within one business day.</div>`;
  } else if (query && query.error === '1') {
    alertHtml = `<div class="alert alert-error">Please fill in your name, phone number and message before sending.</div>`;
  }
  return `
<section class="page-hero wrap">
  <span class="eyebrow">Get In Touch</span>
  <h1>For dealership &amp; bulk enquiries</h1>
  <p>${escapeHtml(content.contact_intro)}</p>
</section>
<section class="wrap">
  <div class="contact-grid">
    <div class="contact-info">
      <div class="contact-row">${icons.trust.pin}<div><strong>Mill Address</strong><span>${escapeHtml(content.address)}</span></div></div>
      <div class="contact-row">${icons.trust.phone}<div><strong>Phone</strong><a href="tel:${escapeHtml((content.phone || '').replace(/\s+/g, ''))}">${escapeHtml(content.phone)}</a></div></div>
      <div class="contact-row">${icons.trust.mail}<div><strong>Email</strong><a href="mailto:${escapeHtml(content.email)}">${escapeHtml(content.email)}</a></div></div>
      <div class="contact-row">${icons.trust.fssai}<div><strong>FSSAI Licence No.</strong><span>${escapeHtml(content.fssai)}</span></div></div>
    </div>
    <form method="POST" action="/contact" class="form-panel">
      ${alertHtml}
      <div class="field-row">
        <div class="field"><label for="f-name">Full Name</label><input type="text" id="f-name" name="name" placeholder="Your name" required></div>
        <div class="field"><label for="f-phone">Phone Number</label><input type="tel" id="f-phone" name="phone" placeholder="98xxxxxxxx" required></div>
      </div>
      <div class="field">
        <label for="f-type">Enquiry Type</label>
        <select id="f-type" name="type">
          <option>General Enquiry</option>
          <option>Dealership</option>
          <option>Bulk / Wholesale Order</option>
          <option>Other</option>
        </select>
      </div>
      <div class="field"><label for="f-msg">Message</label><textarea id="f-msg" name="message" rows="4" placeholder="Tell us what you need..." required></textarea></div>
      <button type="submit" class="btn btn-primary" data-loading-text="Sending…" style="width:100%;justify-content:center;">Send Enquiry</button>
    </form>
  </div>
</section>
`;
}

module.exports = { renderContact };
