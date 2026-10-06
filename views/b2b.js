'use strict';
const { escapeHtml, slugify } = require('../lib/http-utils');
const icons = require('../lib/icons');
const seo = require('../lib/seo');
const { ctaBand, wheatDividerBand } = require('../lib/render');
const { detailsFor } = require('./product-detail');
const { GUIDES } = require('./guides');

// Content for /flour-manufacturer-kanpur. Everything here is drawn from facts
// already published elsewhere on the site (About, Quality, Certifications,
// FAQs, product pages) or supplied by the business. Unknowns — pricing,
// minimum order quantity, pack formats, delivery areas, capacity — are
// deliberately NOT stated; the copy points buyers to an enquiry instead.

// Facility address as stated on the FSSAI licence (see views/certifications.js).
const FACILITY_ADDRESS = 'Gata No. 402, Village Malau, Chaubepur, Tehsil Bilhaur, Kanpur Nagar, Uttar Pradesh – 209203';

// Use-case copy per product, reworded from each product's own page.
const PRODUCT_USE = {
  'fresh-chakki-atta':
    'Our everyday whole wheat atta, naturally stone-ground the traditional chakki way. It is the staple for soft rotis, chapatis and parathas, and suits home kitchens and food-service use alike.',
  maida:
    'A finely refined wheat flour for naan and other leavened breads, biscuits and bakery items. Relevant to bakeries, caterers and food-service kitchens that need a consistent refined flour.',
  'sooji-rava':
    'Evenly milled semolina with a consistent grain size, used for upma, halwa, dosa batter, snacks and other traditional preparations.',
  'tandoori-atta':
    'A coarser stone-ground wheat flour for tandoori-style rotis and thicker parathas, aimed at restaurant and food-service kitchens that cook breads in a tandoor.',
  besan:
    'Gram flour finely milled from cleaned chana dal, used for pakoras, chilla, kadhi and a range of traditional snacks and sweets.',
};

const ENQUIRY_LINKS = [
  { label: 'Dealership', type: 'Dealership' },
  { label: 'Distributorship', type: 'Distributorship' },
  { label: 'Wholesale / bulk purchase', type: 'Wholesale / Bulk Purchase' },
  { label: 'Retail', type: 'Retailer' },
  { label: 'Institutional / HoReCa', type: 'Institutional / HoReCa' },
];

function b2bFaqs(content) {
  const names = 'Fresh Chakki Atta, Maida, Sooji / Rava, Tandoori Atta and Besan';
  return [
    [
      'Does Devmam Flourish Foods LLP make its own flour?',
      `Yes. Our products are milled and packed at our own facility in Chaubepur, Kanpur Nagar, Uttar Pradesh. Devmam Flourish Foods LLP is the company, and Mamta Bhoj is the brand name its products are sold under.`,
    ],
    ['Which products do you make?', `The Mamta Bhoj range currently includes ${names}.`],
    [
      'Can I enquire about bulk or wholesale supply?',
      'Yes. Use the enquiry form on our Contact page and choose "Wholesale / Bulk Purchase" as the enquiry type, and tell us which products you need.',
    ],
    [
      'Do you work with dealers and distributors?',
      'Yes. We are actively onboarding dealers and distributors. Send your details through the Contact page and our team will respond within one business day.',
    ],
    [
      'What information should I include in an enquiry?',
      'Your name and phone number, the type of enquiry, the products you are interested in, your approximate monthly requirement and your city and state. The enquiry form has a field for each.',
    ],
    [
      'Are prices, minimum order quantities and delivery areas listed on the website?',
      'No. Pricing, pack formats, minimum quantities and delivery depend on the product and your requirement, so they are not published here. Please send an enquiry and our team will get back to you.',
    ],
    [
      'Which certifications do you hold?',
      `Our unit is ISO 9001:2015 certified and holds an FSSAI State Licence (Licence No. ${content.fssai || ''}). The certificate and licence documents are available on our Certifications page.`,
    ],
    ['Where is your facility?', `Our facility is at ${FACILITY_ADDRESS}.`],
  ];
}

function arrowIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function renderB2B(content, products) {
  const sorted = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const faqs = b2bFaqs(content);
  const phoneHref = (content.phone || '').replace(/\s+/g, '');

  const productCards = sorted
    .map((p) => {
      const slug = slugify(p.name);
      const details = detailsFor(p);
      const tags = (details.bestFor || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      return `<div class="why-card b2b-product" data-reveal-item>
        <h3><a href="/products/${slug}">Mamta Bhoj ${escapeHtml(p.name)}</a></h3>
        <p>${escapeHtml(PRODUCT_USE[slug] || p.description)}</p>
        ${tags ? `<div class="product-tags">${tags}</div>` : ''}
        <a href="/products/${slug}" class="know-more">View product details ${arrowIcon()}</a>
      </div>`;
    })
    .join('');

  const faqHtml = faqs
    .map(([q, a]) => `<details class="faq-item"><summary>${escapeHtml(q)}${arrowIcon()}</summary><p>${escapeHtml(a)}</p></details>`)
    .join('');

  return `
<section class="wrap" data-reveal>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Flour Manufacturer in Kanpur</span>
  </nav>
</section>

<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Manufacturer &middot; Kanpur Nagar</span>
  <h1>Flour Manufacturer &amp; Bulk Flour Supplier in Kanpur</h1>
  <p>Devmam Flourish Foods LLP mills the Mamta Bhoj range of chakki atta, maida, sooji, tandoori atta and besan at its unit in Chaubepur, Kanpur Nagar, Uttar Pradesh. Dealers, distributors, wholesalers and food businesses are welcome to enquire with us directly.</p>
  <div class="hero-cta" style="margin-top:1.4em;">
    <a href="/contact" class="btn btn-primary">Send a Business Enquiry ${arrowIcon()}</a>
    <a href="/products" class="btn btn-ghost">View All Products</a>
  </div>
</section>

<section class="wrap" data-reveal>
  <div class="prose">
    <h2>Who we are</h2>
    <p>Devmam Flourish Foods LLP is a flour-milling company based at Chaubepur, in Kanpur Nagar district of Uttar Pradesh. Our products are sold under the <strong>Mamta Bhoj</strong> brand: naturally stone-ground chakki atta, along with maida, sooji / rava, tandoori atta and besan, all milled and packed at the same facility.</p>
    <p>If you are looking for a flour mill in Kanpur to source from, or a brand to stock or distribute, this page explains what we make, how we make it and how to reach us. You can also read our <a class="inline-link" href="/about">story</a> or see the <a class="inline-link" href="/quality">quality and process</a> behind the flour.</p>
  </div>
</section>

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="section-head">
    <span class="eyebrow">What We Make</span>
    <h2>The Mamta Bhoj product range</h2>
    <p>Five flours, each with its own page covering what it is for. Each product page also has a direct enquiry link.</p>
  </div>
  <div class="partner-grid">${productCards}</div>
</section>

<section class="wrap" data-reveal>
  <div class="prose">
    <h2>How the flour is made and checked</h2>
    <p>Wheat is sourced and checked for quality before it enters the mill, then cleaned and conditioned to remove impurities before grinding. Our atta is naturally stone-ground in the traditional chakki way. Each batch is checked before packing, then sealed and labelled under ISO 9001:2015 and FSSAI-compliant conditions.</p>
    <p>The <a class="inline-link" href="/quality">Quality &amp; Process page</a> shows each stage in turn. If you would like the background first, our guide to <a class="inline-link" href="/guides/how-flour-is-made">how wheat flour is made</a> explains milling in general terms.</p>
    <h2>Certifications</h2>
    <p>Our unit holds ISO 9001:2015 certification and an FSSAI State Licence (Licence No. ${escapeHtml(content.fssai || '')}). The certified scope on the ISO certificate covers the manufacturing, processing and packing of food products including atta, maida and besan. You can view both documents on the <a class="inline-link" href="/certifications">certifications page</a>.</p>
  </div>
</section>

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="section-head">
    <span class="eyebrow">Business Enquiries</span>
    <h2>Who should get in touch</h2>
    <p>We welcome enquiries from businesses that want to stock, distribute or use Mamta Bhoj flour. Choose the option closest to your case and the enquiry form will be pre-filled.</p>
  </div>
  <ul class="enquiry-links">
    ${ENQUIRY_LINKS.map((e) => `<li><a href="/contact?type=${encodeURIComponent(e.type)}">${escapeHtml(e.label)} enquiry ${arrowIcon()}</a></li>`).join('')}
  </ul>
  <div class="prose">
    <h2>What to include, and what happens next</h2>
    <p>Tell us which products you are interested in, your approximate monthly requirement and your city and state. Our team responds within one business day. Pricing, pack formats, minimum quantities and delivery depend on the product and your requirement, so we do not publish them here; please ask and we will discuss them directly.</p>
  </div>
</section>

<section class="wrap" data-reveal>
  <div class="section-head">
    <span class="eyebrow">Our Facility</span>
    <h2>Where we are</h2>
  </div>
  <div class="location-card b2b-location">
    <div class="contact-row" style="margin-bottom:12px;">${icons.trust.pin}<div><strong>Facility address</strong><span>${escapeHtml(FACILITY_ADDRESS)}</span></div></div>
    <div class="contact-row" style="margin-bottom:12px;">${icons.trust.phone}<div><strong>Phone</strong><a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(content.phone)}</a></div></div>
    <div class="contact-row">${icons.trust.mail}<div><strong>Email</strong><a href="mailto:${escapeHtml(content.email)}">${escapeHtml(content.email)}</a></div></div>
    <p class="location-card-copy" style="margin-top:12px;">The address above is the premises named on our FSSAI State Licence. Devmam Flourish Foods LLP mills and packs Mamta Bhoj products here. See the <a class="inline-link" href="/contact">Contact page</a> for the enquiry form.</p>
  </div>
</section>

<section class="wrap" data-reveal>
  <div class="section-head">
    <span class="eyebrow">Questions Buyers Ask</span>
    <h2>Frequently asked questions</h2>
  </div>
  <div class="faq-list">${faqHtml}</div>
</section>

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Learn More</span><h2>Guides for buyers and cooks</h2></div>
  <ul class="guide-links">
    ${GUIDES.map((g) => `<li><a href="/guides/${g.slug}">${escapeHtml(g.h1)}</a></li>`).join('')}
  </ul>
</section>
${ctaBand(content)}
`;
}

module.exports = { renderB2B, b2bFaqs, FACILITY_ADDRESS };
