'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');

// Google Maps search/directions by address only — there is no verified
// Google Business Profile for Devmam Flourish Foods LLP yet, so this
// deliberately avoids an embedded map or any invented lat/long pin.
const MAPS_QUERY = 'Devmam Flourish Foods LLP, NH34, Chaubepur, Kanpur Nagar, Uttar Pradesh 209203';
const MAPS_SEARCH_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAPS_QUERY)}`;
const MAPS_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(MAPS_QUERY)}`;

const ENQUIRY_TYPES = ['Dealership', 'Distributorship', 'Wholesale / Bulk Purchase', 'Retailer', 'Institutional / HoReCa', 'General Product Enquiry'];
const MONTHLY_REQUIREMENTS = ['Less than 100 kg', '100–500 kg', '500 kg–1 Ton', '1–5 Tons', '5+ Tons'];

function renderContact(content, query, products) {
  let alertHtml = '';
  if (query && query.sent === '1') {
    alertHtml = `<div class="alert alert-success">Thank you. Your enquiry has been received. Our team will get back to you shortly.</div>`;
  } else if (query && query.error === '1') {
    alertHtml = `<div class="alert alert-error">Please fill in your name, phone number, enquiry type and product interest before sending.</div>`;
  }

  const productOptions = (products || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((p) => p.name).concat(['All Products']);
  const productPrefill = (query && query.product ? String(query.product) : '').trim();
  const packPrefill = (query && query.pack ? String(query.pack) : '').trim();
  const prefillMessage = productPrefill ? `Enquiry regarding Mamta Bhoj ${productPrefill}${packPrefill ? ` (${packPrefill} pack)` : ''}.` : '';

  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Get In Touch</span>
  <h1>For dealership &amp; bulk enquiries</h1>
  <p>${escapeHtml(content.contact_intro)}</p>
</section>
<section class="wrap" data-reveal>
  <div class="contact-grid">
    <div class="contact-info">
      <div class="contact-art" aria-hidden="true">${icons.aboutArt()}</div>
      <div class="location-card">
        <div class="contact-row" style="margin-bottom:12px;">${icons.trust.pin}<div><strong>Visit Our Facility</strong><span>${escapeHtml(content.address)}</span></div></div>
        <p class="location-card-copy">Devmam Flourish Foods LLP operates from Chaubepur, Kanpur Nagar, Uttar Pradesh, serving the Mamta Bhoj brand and its customers from our flour-milling facility.</p>
        <div class="location-card-actions">
          <a href="${MAPS_SEARCH_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">Open in Google Maps</a>
          <a href="${MAPS_DIRECTIONS_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Get Directions</a>
        </div>
        <p class="location-card-note">Search our facility location in Google Maps.</p>
      </div>
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
      <div class="field-row">
        <div class="field">
          <label for="f-type">Enquiry Type</label>
          <select id="f-type" name="type" required>
            ${ENQUIRY_TYPES.map((t) => `<option${productPrefill && t === 'General Product Enquiry' ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-product">Product Interest</label>
          <select id="f-product" name="productInterest" required>
            ${productOptions.map((p) => `<option${p === productPrefill ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-qty">Estimated Monthly Requirement <span class="field-optional">(optional)</span></label>
          <select id="f-qty" name="monthlyRequirement">
            <option value="">Select a range</option>
            ${MONTHLY_REQUIREMENTS.map((r) => `<option>${escapeHtml(r)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="f-city">City / State <span class="field-optional">(optional)</span></label><input type="text" id="f-city" name="cityState" placeholder="e.g. Kanpur, Uttar Pradesh"></div>
      </div>
      <div class="field"><label for="f-msg">Message <span class="field-optional">(optional)</span></label><textarea id="f-msg" name="message" rows="3" placeholder="Tell us what you need...">${escapeHtml(prefillMessage)}</textarea></div>
      <button type="submit" class="btn btn-primary" data-loading-text="Sending…" style="width:100%;justify-content:center;">Send Enquiry</button>
    </form>
  </div>
</section>
`;
}

module.exports = { renderContact };
