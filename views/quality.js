'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { ctaBand } = require('../lib/render');

function renderQuality(content, gallery) {
  const sortedGallery = gallery.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return `
<section class="page-hero wrap">
  <span class="eyebrow">Milling &amp; Quality</span>
  <h1>From grain to atta, in four careful steps</h1>
  <p>${escapeHtml(content.quality_intro)}</p>
</section>
<section class="wrap">
  <div class="process-grid">
    <div class="process-step"><div class="process-num">01</div><h4>${escapeHtml(content.process1_title)}</h4><p>${escapeHtml(content.process1_body)}</p></div>
    <div class="process-step"><div class="process-num">02</div><h4>${escapeHtml(content.process2_title)}</h4><p>${escapeHtml(content.process2_body)}</p></div>
    <div class="process-step"><div class="process-num">03</div><h4>${escapeHtml(content.process3_title)}</h4><p>${escapeHtml(content.process3_body)}</p></div>
    <div class="process-step"><div class="process-num">04</div><h4>${escapeHtml(content.process4_title)}</h4><p>${escapeHtml(content.process4_body)}</p></div>
  </div>
</section>
<section class="wrap">
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
    ? `<img src="${escapeHtml(g.image)}" alt="${escapeHtml(g.caption)}">`
    : icons.galleryArt[g.icon] || icons.galleryArt.field;
  return `<div class="gallery-tile">${visual}<div class="gallery-cap">${escapeHtml(g.caption)}</div></div>`;
}

module.exports = { renderQuality, galleryTile };
