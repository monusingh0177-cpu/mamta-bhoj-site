'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { ctaBand, wheatDividerBand } = require('../lib/render');

// Facts below are taken directly from the certificates themselves (see
// public/documents/certifications/). Nothing here is invented or expanded
// beyond what each document states — the ISO scope text in particular is
// quoted verbatim from the certificate.
const ISO_SCOPE = 'MANUFACTURING, PROCESSING, PACKING, BRANDING, TRADING, WHOLESALE AND RETAIL OF FOOD PRODUCTS INCLUDING ATTA, MAIDA, BESAN, DAL (PULSES), SPICES AND ALLIED FOOD AND EDIBLE ITEMS.';
const CERT_ADDRESS = 'GATA NO. 402, VILLAGE MALAU, CHAUBEPUR, TEHSIL BILHAUR, KANPUR NAGAR, UTTAR PRADESH – 209203, INDIA.';

function metaRow(label, value) {
  return `<div class="cert-meta-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderCertifications(content) {
  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Certifications &amp; Compliance</span>
  <h1>Certifications &amp; Compliance</h1>
  <p>Devmam Flourish Foods LLP holds the following certification and licence for its Mamta Bhoj flour-milling operation. Documents are shown as issued, for reference.</p>
</section>

<section class="wrap" data-reveal>
  <div class="cert-grid">
    <div class="cert-card">
      <div class="cert-card-icon">${icons.trust.iso}</div>
      <h2>ISO 9001:2015</h2>
      <p class="cert-card-sub">Quality Management System</p>
      ${metaRow('Certificate Number', 'E20251238177')}
      ${metaRow('Certification Date', '22/12/2025')}
      ${metaRow('Valid Until', '21/12/2028')}
      ${metaRow('Certification Body', 'Royal Assessments Pvt. Ltd. (RAPL)')}
      <p class="cert-card-scope"><strong>Certified scope (as stated on the certificate):</strong> ${escapeHtml(ISO_SCOPE)}</p>
      <p class="cert-card-note">Certificate issued by Royal Assessments Pvt. Ltd. The certificate states that it can be verified through <a href="https://www.iafcertsearch.org" target="_blank" rel="noopener noreferrer">IAF CertSearch</a>.</p>
      <a href="/documents/certifications/iso-9001-2015-certificate.pdf" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">View Certificate</a>
    </div>

    <div class="cert-card">
      <div class="cert-card-icon">${icons.trust.fssai}</div>
      <h2>FSSAI State Licence</h2>
      <p class="cert-card-sub">Food Safety and Standards Authority of India</p>
      ${metaRow('Licence Number', '12726045000053')}
      ${metaRow('Issued / Modified', '28-01-2026')}
      ${metaRow('Valid Until', '15-01-2028')}
      ${metaRow('Category', 'State License')}
      <p class="cert-card-note">Registered/authorised premises as stated on the licence: ${escapeHtml(CERT_ADDRESS)}</p>
      <a href="/documents/certifications/fssai-license-public.pdf" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">View Certificate</a>
    </div>
  </div>
  <p class="cert-page-disclaimer">The FSSAI document above is a public-safe copy of the official licence's main page. Some annexure pages containing personal contact details are not published here.</p>
</section>

${wheatDividerBand()}

${ctaBand(content)}
`;
}

module.exports = { renderCertifications };
