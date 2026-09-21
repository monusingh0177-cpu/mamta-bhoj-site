'use strict';
const { escapeHtml, slugify } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { ctaBand, wheatDividerBand } = require('../lib/render');
const { productCard } = require('./home');

// Presentation copy for each product's detail page. Kept separate from
// data/products.json (the admin-editable source of truth for name,
// description, tags and image) since this is longer editorial content, not
// a field an admin would fill in from the product-edit form — same pattern
// already used for other static content blocks in the view layer (e.g.
// home.js's flowSteps/aboutSlides).
//
// Every claim below is either reworded from the product's own existing
// data/products.json description/tags, or a facility-wide fact already
// published elsewhere on the site (ISO 9001:2015 & FSSAI — see
// lib/render.js certBadge/promoStrip and data/content.json process4_body).
// Nothing here introduces nutrition figures, certifications, shelf life,
// ingredient percentages or pricing that isn't already on the site.
const PRODUCT_DETAILS = {
  'fresh-chakki-atta': {
    highlights: [
      'Naturally stone-ground the traditional chakki way',
      'Milled in small, frequent batches for freshness',
      'Suited to both home and food-service kitchens',
      'Packed under ISO 9001:2015 & FSSAI-compliant conditions',
    ],
    overview: [
      'Mamta Bhoj Fresh Chakki Atta is our everyday whole wheat flour, milled naturally the way a home chakki would grind it — just at a hygienic, modern scale at our Chaubepur, Kanpur facility.',
      'It is the everyday choice for soft rotis, chapatis and parathas, suited equally to home kitchens and food-service use where a dependable, traditional atta is needed every day.',
    ],
    bestFor: ['Everyday rotis', 'Chapatis', 'Parathas', 'Home kitchens', 'Food-service use'],
    seoTitle: 'Fresh Chakki Atta | 5 kg Wheat Flour',
    seoDescription: 'Mamta Bhoj Fresh Chakki Atta — naturally stone-ground whole wheat flour in a 5 kg pack, milled for soft, everyday rotis, chapatis and parathas.',
  },
  maida: {
    highlights: [
      'Finely refined for a smooth, elastic dough',
      'Suited to bakery-style preparations',
      'Milled in small, frequent batches for freshness',
      'Packed under ISO 9001:2015 & FSSAI-compliant conditions',
    ],
    overview: [
      'Mamta Bhoj Maida is a finely refined wheat flour suited to bakery preparations and everyday Indian cooking.',
      'It works well for naan and other leavened breads, biscuits and select bakery items, suited to both home cooking and professional food-service kitchens that need a consistent refined flour.',
    ],
    bestFor: ['Bakery products', 'Naan and other breads', 'Biscuits', 'Cakes and selected preparations'],
    seoTitle: 'Maida | 5 kg Refined Wheat Flour',
    seoDescription: 'Mamta Bhoj Maida, a finely refined wheat flour in a 5 kg pack, suited to naan, bakery items and everyday Indian cooking.',
  },
  'sooji-rava': {
    highlights: [
      'Evenly milled for a consistent grain size',
      'Suited to a wide range of traditional preparations',
      'Milled in small, frequent batches for freshness',
      'Packed under ISO 9001:2015 & FSSAI-compliant conditions',
    ],
    overview: [
      'Mamta Bhoj Sooji / Rava is a semolina milled to a consistent grain size, suited to everyday Indian cooking.',
      'It is a versatile pantry staple for upma, dosa batter, halwa and other sweets, snacks, and traditional preparations that call for a good semolina texture.',
    ],
    bestFor: ['Upma', 'Dosa batter', 'Halwa and sweets', 'Snacks'],
    seoTitle: 'Sooji / Rava | 5 kg Semolina',
    seoDescription: 'Mamta Bhoj Sooji / Rava, evenly milled semolina in a 5 kg pack, suited to upma, halwa, snacks and traditional Indian recipes.',
  },
  'tandoori-atta': {
    highlights: [
      'Coarser stone-ground grind suited to tandoori-style rotis',
      'Same natural, additive-free milling as our Chakki Atta',
      'Suited to restaurant and food-service kitchens',
      'Packed under ISO 9001:2015 & FSSAI-compliant conditions',
    ],
    overview: [
      'Mamta Bhoj Tandoori Atta is a coarser stone-ground wheat flour, milled to suit tandoori-style rotis and thicker parathas.',
      'It is positioned for kitchens — home or food-service — that prepare Indian breads in a tandoor, using the same natural, additive-free milling approach as our Chakki Atta.',
    ],
    bestFor: ['Tandoori roti', 'Restaurant-style breads', 'Tandoor cooking', 'Food-service kitchens'],
    seoTitle: 'Tandoori Atta | 5 kg',
    seoDescription: 'Mamta Bhoj Tandoori Atta, a coarser stone-ground wheat flour in a 5 kg pack, suited to tandoori rotis and food-service kitchens.',
  },
  besan: {
    highlights: [
      'Finely milled from cleaned chana dal',
      'Suited to a wide range of traditional Indian recipes',
      'Milled in small, frequent batches for freshness',
      'Packed under ISO 9001:2015 & FSSAI-compliant conditions',
    ],
    overview: [
      'Mamta Bhoj Besan is gram flour finely milled from cleaned chana dal, suited to everyday Indian cooking.',
      'It is a kitchen staple for pakoras, chilla and kadhi, as well as a range of traditional snacks and sweets that call for a good besan texture.',
    ],
    bestFor: ['Pakoras', 'Chilla', 'Kadhi', 'Besan-based snacks', 'Indian sweets'],
    seoTitle: 'Besan | 5 kg Gram Flour',
    seoDescription: 'Mamta Bhoj Besan, gram flour finely milled from chana dal, in a 5 kg pack, suited to pakoras, chilla, kadhi and Indian sweets.',
  },
};

const PACK_SIZE = '5 kg';

function detailsFor(product) {
  return PRODUCT_DETAILS[slugify(product.name)] || { highlights: [], overview: [product.description], bestFor: [] };
}

function renderProductDetail(product, allProducts, content) {
  const details = detailsFor(product);
  const brandedName = `Mamta Bhoj ${product.name}`;
  const enquiryHref = `/contact?product=${encodeURIComponent(product.name)}&pack=${encodeURIComponent(PACK_SIZE)}`;

  const related = allProducts
    .filter((p) => p.id !== product.id)
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .slice(0, 4);

  const heroVisual = product.image
    ? `<div class="product-photo-frame product-hero-frame"><img class="product-photo" src="${escapeHtml(product.image)}" alt="${escapeHtml(brandedName)} pack, ${escapeHtml(PACK_SIZE)}" loading="lazy"></div>`
    : `<div class="product-photo-frame product-hero-frame"><div class="product-icon">${icons.productIcons[product.icon] || icons.productIcons.wheat}</div></div>`;

  return `
<section class="wrap" data-reveal>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a>
    <span aria-hidden="true">/</span>
    <a href="/products">Products</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">${escapeHtml(product.name)}</span>
  </nav>
</section>

<section class="wrap"><div class="pack-grid" data-reveal>
  ${heroVisual}
  <div>
    <span class="eyebrow">Mamta Bhoj Range</span>
    <h1 style="margin-top:.3em;font-size:clamp(1.7rem,3.4vw,2.4rem);">${escapeHtml(brandedName)}</h1>
    <p style="margin-top:.7em;max-width:56ch;font-size:1rem;">${escapeHtml(product.description)}</p>
    <div class="product-hero-meta"><strong>Pack Size</strong><span>${escapeHtml(PACK_SIZE)}</span></div>
    <div class="hero-cta" style="margin-top:1.4em;">
      <a href="${enquiryHref}" class="btn btn-primary">Enquire About This Product ${arrowIcon()}</a>
      <a href="/products" class="btn btn-ghost">Back to All Products</a>
    </div>
  </div>
</div></section>

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Highlights</span><h2>Why Choose ${escapeHtml(brandedName)}</h2></div>
  <ul class="pack-list">
    ${details.highlights.map((h) => `<li>${icons.trust.check}<span>${escapeHtml(h)}</span></li>`).join('')}
  </ul>
</section>

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Overview</span><h2>About This Product</h2></div>
  ${details.overview.map((p) => `<p style="max-width:70ch;margin-top:.8em;">${escapeHtml(p)}</p>`).join('')}
</section>

${
  details.bestFor.length
    ? `<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Best Suited For</span><h2>Where ${escapeHtml(brandedName)} Works Best</h2></div>
  <div class="product-tags" style="gap:10px;">${details.bestFor.map((u) => `<span class="tag">${escapeHtml(u)}</span>`).join('')}</div>
</section>`
    : ''
}

${wheatDividerBand()}

${
  related.length
    ? `<section class="wrap" data-reveal>
  <div class="section-head section-head--center"><span class="eyebrow">Explore More</span><h2>Explore More from Mamta Bhoj</h2></div>
  <div class="product-grid">
    ${related.map((p) => productCard(p)).join('')}
  </div>
</section>`
    : ''
}

${ctaBand(content)}
`;
}

function arrowIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

module.exports = { renderProductDetail, detailsFor, PRODUCT_DETAILS, PACK_SIZE };
