'use strict';
const { escapeHtml, slugify } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { whyGrid, promoStrip, ctaBand, wheatDividerBand, journeySection } = require('../lib/render');

function renderHome(content, products) {
  const sorted = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const featured = products.find((p) => p.featured) || products[0];

  // AI-generated representative visuals of a flour-mill facility — not
  // photographs of the actual Devmam Flourish Foods factory.
  const aboutSlides = [
    { image: 'about-mill-exterior.jpg', alt: 'Representative AI-generated visual of a flour-mill exterior', eyebrow: 'Mill Exterior' },
    { image: 'about-mill-silos.jpg', alt: 'Representative AI-generated visual of grain storage silos', eyebrow: 'Grain Silos' },
    { image: 'about-mill-facility.jpg', alt: 'Representative AI-generated visual of a flour processing facility', eyebrow: 'Processing Facility' },
    { image: 'about-mill-entrance.jpg', alt: 'Representative AI-generated visual of a flour-mill entrance', eyebrow: 'Mill Entrance' },
  ];

  const flowSteps = [
    { key: 'wheat', label: 'Wheat', sub: 'Pure Grain' },
    { key: 'mill', label: 'Mill', sub: 'Clean & Grind' },
    { key: 'flour', label: 'Flour', sub: 'Wholesome Nutrition' },
    { key: 'food', label: 'Food', sub: 'Everyday Goodness' },
  ];

  // Each slide's headline/description/branding is baked into its photo
  // (see public/images/hero/README.md) — only the pieces that genuinely
  // must be real, interactive HTML remain here: the slide's accessible
  // label (for the dots) and its clickable CTA.
  const slides = [
    {
      image: 'hero-milling.jpg', alt: 'Advanced Milling for Pure & Consistent Quality — modern flour-milling machinery in a clean, food-grade production environment',
      eyebrow: 'Modern Milling', cta: 'Our Process', href: '/quality',
    },
    {
      image: 'hero-wheat-to-flour.jpg', alt: 'From Wheat to Flour — raw wheat grain alongside freshly milled flour',
      eyebrow: 'From Wheat to Flour', cta: 'See Our Range', href: '/products',
    },
    {
      image: 'hero-quality-hygiene.jpg', alt: 'Quality You Can Trust — clean, hygienic food-processing environment',
      eyebrow: 'Quality &amp; Hygiene', cta: 'Our Standards', href: '/quality',
    },
    {
      image: 'hero-kitchen.jpg', alt: 'From Our Mill to Your Kitchen — premium flour and wheat grain',
      eyebrow: 'Ready for Your Kitchen', cta: 'Explore Products', href: '/products',
    },
  ];

  return `
<section class="hero-band"><div class="hero wrap">
  <div class="hero-grid">
    <div data-reveal>
      <span class="eyebrow">${escapeHtml(content.hero_eyebrow)}</span>
      <h1>${escapeHtml(content.hero_title)}<br><em>${escapeHtml(content.hero_title_accent)}</em></h1>
      <p class="lead">${escapeHtml(content.hero_lead)}</p>
      <div class="hero-cta">
        <a href="/products" class="btn btn-primary">Explore Products ${arrowIcon()}</a>
        <a href="/contact" class="btn btn-ghost">Get in Touch</a>
      </div>
      <div class="hero-flow" aria-label="Our journey: from wheat to your family's table">
        ${flowSteps
          .map(
            (s, i) => `${i > 0 ? `<span class="hero-flow-arrow" aria-hidden="true">${arrowIcon()}</span>` : ''}
            <div class="hero-flow-step">
              <div class="hero-flow-icon">${icons.heroFlowIcons[s.key]}</div>
              <div><strong>${s.label.toUpperCase()}</strong><span>${escapeHtml(s.sub)}</span></div>
            </div>`
          )
          .join('')}
      </div>
      <p class="hero-script-tagline">${icons.wheatEar('var(--wheat-gold)', 2)}<span>From Our Fields to Your Family</span></p>
    </div>
    <div class="hero-carousel" data-carousel aria-roledescription="carousel" aria-label="Mamta Bhoj mill and product highlights" data-reveal>
      <div class="hero-carousel-track">
        ${slides
          .map(
            (s, i) => `<div class="hero-carousel-slide${i === 0 ? ' is-active' : ''}" data-slide-index="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
              <div class="hero-carousel-art" data-expected="${s.image}"><img data-carousel-img src="/images/hero/${s.image}" alt="${escapeHtml(s.alt)}" ${i === 0 ? '' : 'loading="lazy"'}></div>
              <a href="${s.href}" class="hero-carousel-cta">${s.cta} ${arrowIcon()}</a>
            </div>`
          )
          .join('')}
      </div>
      <button type="button" class="hero-carousel-arrow hero-carousel-arrow--prev" data-carousel-prev aria-label="Previous slide">${arrowIcon('left')}</button>
      <button type="button" class="hero-carousel-arrow hero-carousel-arrow--next" data-carousel-next aria-label="Next slide">${arrowIcon()}</button>
      <div class="hero-carousel-dots" role="tablist" aria-label="Choose a slide">
        ${slides
          .map(
            (s, i) => `<button type="button" class="hero-carousel-dot${i === 0 ? ' is-active' : ''}" data-slide-goto="${i}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-label="Slide ${i + 1}: ${s.eyebrow}"></button>`
          )
          .join('')}
      </div>
    </div>
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
  <div class="about-carousel" data-carousel data-carousel-interval="5500" aria-roledescription="carousel" aria-label="Our mill facility">
    <div class="about-carousel-track">
      ${aboutSlides
        .map(
          (s, i) => `<div class="about-carousel-slide${i === 0 ? ' is-active' : ''}" data-slide-index="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
            <div class="about-carousel-art" data-expected="${s.image}"><img data-carousel-img src="/images/about-mill/${s.image}" alt="${escapeHtml(s.alt)}" ${i === 0 ? '' : 'loading="lazy"'}></div>
          </div>`
        )
        .join('')}
    </div>
    <button type="button" class="about-carousel-arrow about-carousel-arrow--prev" data-carousel-prev aria-label="Previous slide">${arrowIcon('left')}</button>
    <button type="button" class="about-carousel-arrow about-carousel-arrow--next" data-carousel-next aria-label="Next slide">${arrowIcon()}</button>
    <div class="about-carousel-dots" role="tablist" aria-label="Choose a slide">
      ${aboutSlides
        .map(
          (s, i) => `<button type="button" class="about-carousel-dot${i === 0 ? ' is-active' : ''}" data-slide-goto="${i}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-label="Slide ${i + 1}: ${s.eyebrow}"></button>`
        )
        .join('')}
    </div>
  </div>
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

function arrowIcon(direction) {
  if (direction === 'left') {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function productCard(p) {
  const tags = (Array.isArray(p.tags) ? p.tags : []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const visual = p.image
    ? `<div class="product-photo-frame"><img class="product-photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)} pack" loading="lazy"></div>`
    : `<div class="product-icon" style="margin:20px 0 0 20px;">${icons.productIcons[p.icon] || icons.productIcons.wheat}</div>`;
  return `<div class="product-card${p.featured ? ' featured' : ''}" data-reveal-item>
    ${p.image ? visual : ''}
    <div class="pc-body">
      ${p.image ? '' : visual}
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description)}</p>
      <div class="product-tags">${tags}</div>
      <a href="/products/${slugify(p.name)}" class="know-more">Know More ${arrowIcon()}</a>
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
