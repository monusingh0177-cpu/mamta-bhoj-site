'use strict';
const { escapeHtml } = require('../lib/http-utils');
const { ctaBand } = require('../lib/render');

function arrowIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function renderFAQ(content) {
  const faqs = [
    ['Is Mamta Bhoj atta freshly milled?', 'Yes. We mill in small, frequent batches at our Chaubepur facility rather than holding large pre-milled stock, so what reaches you is milled close to your order.'],
    ['What does "naturally stone-ground" mean?', 'Our atta is ground the traditional chakki way instead of high-speed roller milling. This keeps more of the wheat’s natural fibre, bran and nutrients intact.'],
    ['Is Mamta Bhoj FSSAI licensed and ISO certified?', `Yes — our facility is FSSAI licensed (Licence No. ${content.fssai || ''}) and ISO 9001:2015 certified. Both are printed on every pack.`],
    ['How should I store the atta, maida or sooji after opening?', 'Keep the pack sealed and store it in a cool, dry place away from direct sunlight and moisture. Batch and packing details are printed on the label — please refer to it for guidance.'],
    ['Do you offer dealership or distributor opportunities?', 'Yes. We are actively onboarding dealers and distributors. Send us your details from the Contact page and our team will respond within one business day.'],
    ['Can I place a bulk or wholesale order?', 'Yes. Use the enquiry form on our Contact page and select "Bulk / Wholesale Order" as the enquiry type — our team will get in touch to discuss quantities and pricing.'],
    ['Where is Mamta Bhoj made?', `All our products are milled and packed at our facility at ${content.address || ''}.`],
    ['How can I get in touch with your team?', `Call us at ${content.phone || ''}, email ${content.email || ''}, or use the enquiry form on our Contact page.`],
  ];
  const faqHtml = faqs
    .map(
      ([q, a]) =>
        `<details class="faq-item"><summary>${escapeHtml(q)}${arrowIcon()}</summary><p>${escapeHtml(a)}</p></details>`
    )
    .join('');
  return `
<section class="page-hero wrap">
  <span class="eyebrow">FAQs</span>
  <h1>Frequently asked questions</h1>
  <p>Answers to common questions about our products, certifications and how to order.</p>
</section>
<section class="wrap"><div class="faq-list">${faqHtml}</div></section>
${ctaBand(content)}
`;
}

module.exports = { renderFAQ };
