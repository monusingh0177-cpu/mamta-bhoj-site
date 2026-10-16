'use strict';
const { picture } = require('../lib/picture');
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { whatsappHref, WHATSAPP_DISPLAY } = require('../lib/business');
const { ENQUIRY_TYPES, MONTHLY_REQUIREMENTS, MESSAGES } = require('../lib/enquiry');
const guard = require('../lib/spam-guard');

// ?error=<code> shown after a plain (no-JavaScript) POST was refused. Unknown codes get the generic message.
const ERROR_TEXT = {
  spam: MESSAGES.spam,
  rate_limited: MESSAGES.rateLimited,
  expired: MESSAGES.expired,
  too_fast: MESSAGES.tooFast,
  captcha: MESSAGES.captcha,
  captcha_unavailable: MESSAGES.captchaDown,
  server: MESSAGES.server,
};

function renderContact(content, query, products) {
  let alertHtml = '';
  if (query && query.sent === '1') {
    alertHtml = `<div class="alert alert-success" role="status">${escapeHtml(MESSAGES.success)}</div>`;
  } else if (query && query.error === '1') {
    alertHtml = `<div class="alert alert-error" role="alert">Please fill in your name, phone number, enquiry type and product interest correctly before sending.</div>`;
  } else if (query && query.error) {
    const text = Object.prototype.hasOwnProperty.call(ERROR_TEXT, String(query.error)) ? ERROR_TEXT[String(query.error)] : MESSAGES.invalid;
    alertHtml = `<div class="alert alert-error" role="alert">${escapeHtml(text)}</div>`;
  }

  const productOptions = (products || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((p) => p.name).concat(['All Products']);
  const productPrefill = (query && query.product ? String(query.product) : '').trim();
  const prefillMessage = productPrefill ? `Enquiry regarding Mamta Bhoj ${productPrefill}.` : '';

  // ?type=<Enquiry Type> preselects the Enquiry Type dropdown directly (used
  // by the homepage's "Become a Partner" / "Discuss Bulk Requirements"
  // CTAs). Falls back to the existing product-prefill behaviour (defaulting
  // to "General Product Enquiry") when no explicit type is given.
  const typeParam = (query && query.type ? String(query.type) : '').trim();
  const selectedType = ENQUIRY_TYPES.includes(typeParam) ? typeParam : productPrefill ? 'General Product Enquiry' : '';

  // Optional Cloudflare Turnstile widget: rendered only when both keys are configured (verified server-side on submit).
  const turnstileHtml = guard.turnstileEnabled()
    ? `<div class="field"><div class="cf-turnstile" data-sitekey="${escapeHtml(guard.config().turnstileSite)}" data-theme="light"></div></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : '';

  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Get In Touch</span>
  <h1>For dealership &amp; bulk enquiries</h1>
  <p>${escapeHtml(content.contact_intro)}</p>
</section>
<section class="wrap" data-reveal>
  <div class="contact-grid">
    <div class="contact-info">
      <div class="contact-art">${picture('/images/about-mill/about-mill-exterior.jpg', 'alt="Representative AI-generated visual of a flour-mill exterior" loading="lazy" decoding="async"')}</div>
      <div class="location-card">
        <div class="contact-row" style="margin-bottom:12px;">${icons.trust.pin}<div><strong>Visit Our Facility</strong><span>${escapeHtml(content.address)}</span></div></div>
        <p class="location-card-copy">Devmam Flourish Foods LLP operates from Chaubepur, Kanpur Nagar, Uttar Pradesh, serving the Mamta Bhoj brand and its customers from our flour-milling facility.</p>
      </div>
      <div class="contact-row">${icons.trust.phone}<div><strong>Phone</strong><a href="tel:${escapeHtml((content.phone || '').replace(/\s+/g, ''))}">${escapeHtml(content.phone)}</a></div></div>
      <div class="contact-row">${icons.whatsapp}<div><strong>WhatsApp</strong><a href="${escapeHtml(whatsappHref())}" target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp (opens in a new tab)">Chat on WhatsApp: ${escapeHtml(WHATSAPP_DISPLAY)}</a></div></div>
      <div class="contact-row">${icons.trust.mail}<div><strong>Email</strong><a href="mailto:${escapeHtml(content.email)}">${escapeHtml(content.email)}</a></div></div>
      <div class="contact-row">${icons.trust.fssai}<div><strong>FSSAI Licence No.</strong><span>${escapeHtml(content.fssai)}</span></div></div>
      <p class="contact-more">Before you write, you can browse the <a class="inline-link" href="/products">Mamta Bhoj products</a>, read about us as a <a class="inline-link" href="/flour-manufacturer-kanpur">flour manufacturer in Kanpur</a> and our <a class="inline-link" href="/flour-manufacturer-india">overview for buyers across India</a>, or see how to <a class="inline-link" href="/bulk-flour-supplier-india">buy flour in bulk</a>.</p>
    </div>
    <form method="POST" action="/contact" class="form-panel" data-enquiry-form data-phone="${escapeHtml(content.phone || '')}" data-email="${escapeHtml(content.email || '')}">
      <h2 class="form-panel-title">Send us an enquiry</h2>
      <div id="enquiry-status" class="enquiry-status" role="status" aria-live="polite" tabindex="-1"></div>
      ${alertHtml}
      <div class="field-row">
        <div class="field"><label for="f-name">Full Name</label><input type="text" id="f-name" name="name" placeholder="Your name" required></div>
        <div class="field"><label for="f-phone">Phone Number</label><input type="tel" id="f-phone" name="phone" placeholder="10-digit mobile number" required inputmode="numeric" maxlength="10" minlength="10" pattern="[6-9][0-9]{9}" autocomplete="tel-national" title="Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9" aria-describedby="f-phone-hint"><span class="field-hint" id="f-phone-hint">10 digits, without +91 or 0</span></div>
      </div>
      <div class="field"><label for="f-email">Email Address <span class="field-optional">(optional)</span></label><input type="email" id="f-email" name="email" placeholder="you@example.com" maxlength="254" autocomplete="email"></div>
      <div class="field-row">
        <div class="field">
          <label for="f-type">Enquiry Type</label>
          <select id="f-type" name="type" required>
            ${ENQUIRY_TYPES.map((t) => `<option${t === selectedType ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}
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
      <div class="hp-field" aria-hidden="true"><label for="f-hp">Leave this field empty</label><input type="text" id="f-hp" name="${guard.HONEYPOT_FIELD}" value="" tabindex="-1" autocomplete="off"></div>
      <input type="hidden" name="${guard.TOKEN_FIELD}" value="${escapeHtml(guard.issueFormToken())}">
      ${turnstileHtml}
      <button type="submit" class="btn btn-primary" data-loading-text="Sending…" style="width:100%;justify-content:center;">Send Enquiry</button>
    </form>
  </div>
</section>
`;
}

module.exports = { renderContact };
