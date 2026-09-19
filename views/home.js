'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { whyGrid, promoStrip, ctaBand, wheatDividerBand, journeySection } = require('../lib/render');

function renderHome(content, products) {
  const sorted = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const featured = products.find((p) => p.featured) || products[0];

  return `
<section class="hero-band"><div class="hero-field-wrap" aria-hidden="true">${icons.heroField()}</div><div class="hero wrap">
  <div class="hero-grid">
    <div data-reveal>
      <span class="eyebrow">${escapeHtml(content.hero_eyebrow)}</span>
      <h1>${escapeHtml(content.hero_title)}<br><em>${escapeHtml(content.hero_title_accent)}</em></h1>
      <p class="lead">${escapeHtml(content.hero_lead)}</p>
      <div class="hero-cta">
        <a href="/products" class="btn btn-primary">Explore Products</a>
        <a href="/contact" class="btn btn-ghost">Get in Touch</a>
      </div>
      <ul class="hero-flow" aria-label="From wheat to your family's table">
        <li>Wheat</li><li aria-hidden="true">${arrowIcon()}</li>
        <li>Mill</li><li aria-hidden="true">${arrowIcon()}</li>
        <li>Flour</li><li aria-hidden="true">${arrowIcon()}</li>
        <li>Food</li><li aria-hidden="true">${arrowIcon()}</li>
        <li>Family</li>
      </ul>
    </div>
    <div class="hero-art" data-reveal>${icons.heroArt()}</div>
  </div>
</div></section>

${promoStrip(icons)}

<section class="wrap"><div class="trust-strip" style="margin-top:0;">
  <div class="trust-item">${icons.trust.iso}<strong>ISO 9001:2015<br>Certified Unit</strong></div>
  <div class="trust-item">${icons.trust.fssai}<strong>FSSAI<br>Licensed</strong></div>
  <div class="trust-item">${icons.trust.natural}<strong>100% Natural,<br>No Additives</strong></div>
  <div class="trust-item">${icons.trust.stone}<strong>Naturally<br>Stone-Ground</strong></div>
</div></section>

<section class="stats-band"><div class="stats-grid">
  <div class="stats-cell"><strong>${escapeHtml(content.stat1_num)}</strong><span>${escapeHtml(content.stat1_label)}</span></div>
  <div class="stats-cell"><strong>${escapeHtml(content.stat2_num)}</strong><span>${escapeHtml(content.stat2_label)}</span></div>
  <div class="stats-cell"><strong>${escapeHtml(content.stat3_num)}</strong><span>${escapeHtml(content.stat3_label)}</span></div>
</div></section>

<section class="wrap"><div class="home-about" data-reveal>
  <div class="about-art about-art--framed">${icons.aboutArt()}<span class="wheat-corner">${icons.wheatEar('var(--wheat-gold)', 5)}</span></div>
  <div>
    <span class="eyebrow">Who We Are</span>
    <h2 style="margin-top:.4em;font-size:clamp(1.4rem,2.6vw,1.9rem);">${escapeHtml(content.about_title)}</h2>
    <p style="margin-top:.6em;">${escapeHtml(content.about_body1)}</p>
    <a href="/about" class="btn btn-ghost" style="margin-top:1.2em;">Know More About Us</a>
  </div>
</div></section>

<section class="wheat-feature">
  <div class="wrap wheat-feature-grid" data-reveal>
    <div class="wheat-feature-copy">
      <span class="eyebrow">Our Raw Material</span>
      <h2>Good Flour Begins With Good Grain</h2>
      <p>Every Mamta Bhoj pack starts the same way — with wheat, not shortcuts. We mill naturally, the traditional chakki way, so the fibre, bran and nutrition already in the grain stay in the flour instead of being stripped out for speed.</p>
      <ul class="wheat-feature-list">
        <li>${icons.trust.check}<span>Naturally stone-ground, never over-processed</span></li>
        <li>${icons.trust.check}<span>Milled in small, frequent batches for freshness</span></li>
        <li>${icons.trust.check}<span>Produced under ISO 9001:2015 &amp; FSSAI conditions</span></li>
      </ul>
    </div>
    <div class="wheat-feature-art" aria-hidden="true">
      <div class="wheat-ear-lg">${icons.wheatEar('var(--wheat-gold)', 7)}</div>
      <div class="wheat-ear-lg wheat-ear-lg--alt">${icons.wheatEar('var(--brand-navy)', 6)}</div>
    </div>
  </div>
</section>

<section class="wrap">
  <div class="section-head">
    <span class="eyebrow">Our Range</span>
    <h2>Milled fresh, straight from Kanpur</h2>
    <p>Every staple under the Mamta Bhoj name is ground the same careful way — naturally stone-ground, hygienically packed, milled close to when you order.</p>
  </div>
  <div class="product-grid">
    ${sorted.map((p) => productCard(p)).join('')}
  </div>
  <div style="text-align:center;margin-top:28px;">
    <a href="/products" class="btn btn-ghost">View All Products</a>
  </div>
</section>

${featured && featured.image ? packagingShowcase(featured) : ''}

${wheatDividerBand()}

${journeySection(content, { link: true })}

${whyGrid(icons, 'Freshness you can taste, standards you can trust')}

${ctaBand(content)}
`;
}

function arrowIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function productCard(p) {
  const tags = (Array.isArray(p.tags) ? p.tags : []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const visual = p.image
    ? `<img class="product-photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    : `<div class="product-icon" style="margin:20px 0 0 20px;">${icons.productIcons[p.icon] || icons.productIcons.wheat}</div>`;
  return `<div class="product-card${p.featured ? ' featured' : ''}" data-reveal-item>
    ${p.image ? visual : ''}
    <div class="pc-body">
      ${p.image ? '' : visual}
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description)}</p>
      <div class="product-tags">${tags}</div>
      <a href="/products" class="know-more">Know More ${arrowIcon()}</a>
    </div>
  </div>`;
}

function packagingShowcase(product) {
  if (!product.image) return '';
  return `<section class="wrap" data-reveal>
    <div class="pack-grid">
      <div class="pack-photo"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} pack" loading="lazy"></div>
      <div>
        <span class="eyebrow">As It Reaches Your Kitchen</span>
        <h2 style="margin-top:.4em;font-size:clamp(1.4rem,2.6vw,1.9rem);">Packed for freshness, labelled for trust</h2>
        <p style="margin-top:.6em;">Every pack carries full nutrition information, batch and packing details, our FSSAI licence number and ISO 9001:2015 mark — so you always know exactly what's going into your rotis.</p>
        <ul class="pack-list">
          <li>${icons.trust.check}<span>Nutrition information printed on every pack</span></li>
          <li>${icons.trust.check}<span>FSSAI licence &amp; batch/packing date on the label</span></li>
          <li>${icons.trust.check}<span>Sealed packaging — store in a cool, dry place</span></li>
        </ul>
      </div>
    </div>
  </section>`;
}

module.exports = { renderHome, productCard };
