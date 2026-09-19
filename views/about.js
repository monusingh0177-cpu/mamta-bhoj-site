'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { whyGrid, ctaBand } = require('../lib/render');

function renderAbout(content) {
  return `
<section class="page-hero wrap">
  <span class="eyebrow">About Us</span>
  <h1>Devmam Flourish Foods LLP</h1>
  <p>Millers of the Mamta Bhoj range — fresh, naturally stone-ground atta, maida and sooji from our unit in Chaubepur, Kanpur.</p>
</section>
<section class="wrap">
  <div class="about-grid">
    <div class="about-art">${icons.aboutArt()}</div>
    <div class="about-copy">
      <h2 style="font-size:clamp(1.5rem,2.8vw,2rem);">${escapeHtml(content.about_title)}</h2>
      <p>${escapeHtml(content.about_body1)}</p>
      <p>${escapeHtml(content.about_body2)}</p>
      <div class="stat-row">
        <div><strong>${escapeHtml(content.stat1_num)}</strong><span>${escapeHtml(content.stat1_label)}</span></div>
        <div><strong>${escapeHtml(content.stat2_num)}</strong><span>${escapeHtml(content.stat2_label)}</span></div>
        <div><strong>${escapeHtml(content.stat3_num)}</strong><span>${escapeHtml(content.stat3_label)}</span></div>
      </div>
    </div>
  </div>
</section>
${whyGrid(icons, 'Freshness you can taste, standards you can trust')}
${ctaBand(content)}
`;
}

module.exports = { renderAbout };
