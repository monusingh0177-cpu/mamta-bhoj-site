'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { ctaBand, wheatDividerBand } = require('../lib/render');

function renderQuality(content, gallery) {
  const sortedGallery = gallery.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const checkpoints = [
    'Raw-material selection before any grain enters the mill',
    'Cleaning &amp; conditioning to remove impurities',
    'Controlled, naturally stone-ground processing',
    'Hygienic handling throughout the facility',
    'Quality inspection before packing',
    'Sealed, hygienic packaging with full batch details',
  ];
  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Milling &amp; Quality</span>
  <h1>From grain to atta, under careful control</h1>
  <p>${escapeHtml(content.quality_intro)}</p>
</section>

<section class="wrap" data-reveal>
  <div class="quality-spotlight">
    <div class="quality-spotlight-art" aria-hidden="true">
      ${icons.aboutArt()}
      <div class="quality-badge-float">${icons.trust.fssai}<span>FSSAI &amp; ISO<br>Compliant Facility</span></div>
    </div>
    <div class="quality-spotlight-copy">
      <span class="eyebrow">Hygiene &amp; Control</span>
      <h2>Every checkpoint, every batch</h2>
      <p>Nothing reaches a Mamta Bhoj pack without passing through the same controlled sequence — no shortcuts, no exceptions.</p>
      <ul class="quality-checklist">
        ${checkpoints.map((c) => `<li>${icons.trust.check}<span>${c}</span></li>`).join('')}
      </ul>
    </div>
  </div>
</section>

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="process-grid">
    <div class="process-step" data-reveal-item><div class="process-num">01</div><h4>${escapeHtml(content.process1_title)}</h4><p>${escapeHtml(content.process1_body)}</p></div>
    <div class="process-step" data-reveal-item><div class="process-num">02</div><h4>${escapeHtml(content.process2_title)}</h4><p>${escapeHtml(content.process2_body)}</p></div>
    <div class="process-step" data-reveal-item><div class="process-num">03</div><h4>${escapeHtml(content.process3_title)}</h4><p>${escapeHtml(content.process3_body)}</p></div>
    <div class="process-step" data-reveal-item><div class="process-num">04</div><h4>${escapeHtml(content.process5_title)}</h4><p>${escapeHtml(content.process5_body)}</p></div>
    <div class="process-step" data-reveal-item><div class="process-num">05</div><h4>${escapeHtml(content.process4_title)}</h4><p>${escapeHtml(content.process4_body)}</p></div>
    <div class="process-step" data-reveal-item><div class="process-num">06</div><h4>${escapeHtml(content.process6_title)}</h4><p>${escapeHtml(content.process6_body)}</p></div>
  </div>
</section>

<section class="wrap" data-reveal>
  <div class="section-head">
    <span class="eyebrow">From Our Mill</span>
    <h2>A glimpse of the process</h2>
  </div>
  <div class="gallery-grid">
    ${sortedGallery.map((g) => galleryTile(g)).join('')}
  </div>
</section>
${ctaBand(content)}
`;
}

function galleryTile(g) {
  const visual = g.image
    ? `<img src="${escapeHtml(g.image)}" alt="${escapeHtml(g.caption)}" loading="lazy">`
    : icons.galleryArt[g.icon] || icons.galleryArt.field;
  return `<div class="gallery-tile" data-reveal-item>${visual}<div class="gallery-cap">${escapeHtml(g.caption)}</div></div>`;
}

module.exports = { renderQuality, galleryTile };
