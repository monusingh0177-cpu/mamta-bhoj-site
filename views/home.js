'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { whyGrid, promoStrip, ctaBand } = require('../lib/render');

function renderHome(content, products) {
  const sorted = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const featured = products.find((p) => p.featured) || products[0];

  return `
<section class="hero-band"><div class="hero wrap">
  <div class="hero-grid">
    <div>
      <span class="eyebrow">${escapeHtml(content.hero_eyebrow)}</span>
      <h1>${escapeHtml(content.hero_title)}<br><em>${escapeHtml(content.hero_title_accent)}</em></h1>
      <p class="lead">${escapeHtml(content.hero_lead)}</p>
      <div class="hero-cta">
        <a href="/products" class="btn btn-primary">Explore Products</a>
        <a href="/contact" class="btn btn-ghost">Get in Touch</a>
      </div>
    </div>
    <div class="hero-art">${icons.heroArt()}</div>
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

<section class="wrap">
  <div class="section-head">
    <span class="eyebrow">Our Range</span>
    <h2>Milled fresh, straight from Kanpur</h2>
    <p>Three staples, ground the same careful way — 100% whole-grain atta, fine maida and soft-textured sooji.</p>
  </div>
  <div class="product-grid">
    ${sorted.map((p) => productCard(p)).join('')}
  </div>
  <div style="text-align:center;margin-top:28px;">
    <a href="/products" class="btn btn-ghost">View All Products</a>
  </div>
</section>

${featured && featured.image ? packagingShowcase(featured) : ''}

<section class="wrap"><div class="home-about">
  <div class="about-art">${icons.aboutArt()}</div>
  <div>
    <span class="eyebrow">About Devmam Flourish Foods</span>
    <h2 style="margin-top:.4em;font-size:clamp(1.4rem,2.6vw,1.9rem);">${escapeHtml(content.about_title)}</h2>
    <p style="margin-top:.6em;">${escapeHtml(content.about_body1)}</p>
    <a href="/about" class="btn btn-ghost" style="margin-top:1.2em;">Know More About Us</a>
  </div>
</div></section>

<section class="mini-process"><div class="wrap"><div class="mini-process-grid">
  <div class="mini-process-step"><div class="num">01</div><span>${escapeHtml(content.process1_title)}</span></div>
  <div class="mini-process-step"><div class="num">02</div><span>${escapeHtml(content.process2_title)}</span></div>
  <div class="mini-process-step"><div class="num">03</div><span>${escapeHtml(content.process3_title)}</span></div>
  <div class="mini-process-step"><div class="num">04</div><span>${escapeHtml(content.process4_title)}</span></div>
</div>
<div style="text-align:center;margin-top:20px;"><a href="/quality" class="know-more" style="margin:0 auto;">See Our Full Process ${arrowIcon()}</a></div>
</div></section>

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
    ? `<img class="product-photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
    : `<div class="product-icon" style="margin:20px 0 0 20px;">${icons.productIcons[p.icon] || icons.productIcons.wheat}</div>`;
  return `<div class="product-card${p.featured ? ' featured' : ''}">
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
  return `<section class="wrap">
    <div class="pack-grid">
      <div class="pack-photo"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} pack"></div>
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
