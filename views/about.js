'use strict';
const { escapeHtml } = require('../lib/http-utils');
const icons = require('../lib/icons');
const { whyGrid, ctaBand, wheatDividerBand } = require('../lib/render');

function renderAbout(content) {
  const timeline = [
    { icon: icons.journeyIcons.rawWheat, title: 'It Starts With Grain', body: 'Every batch begins with wheat sourced and checked before it enters the mill.' },
    { icon: icons.journeyIcons.milling, title: 'Milled the Traditional Way', body: 'Naturally chakki-ground, the way flour has always been made in Indian homes — just at a hygienic, modern scale.' },
    { icon: icons.journeyIcons.packaging, title: 'Packed With Care', body: 'Sealed and labelled under ISO 9001:2015 &amp; FSSAI-compliant conditions, batch by batch.' },
    { icon: icons.journeyIcons.readyKitchen, title: 'Reaches Your Kitchen', body: 'From our Chaubepur facility to your rotis, parathas and everyday cooking.' },
  ];
  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">About Us</span>
  <h1>Devmam Flourish Foods LLP</h1>
  <p>Millers of the Mamta Bhoj range — fresh, naturally stone-ground atta, maida and sooji from our unit in Chaubepur, Kanpur.</p>
</section>
<section class="wrap">
  <div class="about-grid" data-reveal>
    <div class="about-art about-art--framed">${icons.aboutArt()}<span class="wheat-corner">${icons.wheatEar('var(--wheat-gold)', 5)}</span></div>
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

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="section-head section-head--center">
    <span class="eyebrow">Our Journey</span>
    <h2>Grain to Goodness</h2>
    <p>The same story, every single batch — from raw wheat to a pack on your kitchen shelf.</p>
  </div>
  <div class="story-timeline">
    ${timeline
      .map(
        (t, i) => `<div class="story-step" data-reveal-item style="--i:${i}">
          <div class="story-step-icon">${t.icon}</div>
          <div class="story-step-line" aria-hidden="true"></div>
          <h4>${escapeHtml(t.title)}</h4>
          <p>${t.body}</p>
        </div>`
      )
      .join('')}
  </div>
</section>

${whyGrid(icons, 'Freshness you can taste, standards you can trust')}
${ctaBand(content)}
`;
}

module.exports = { renderAbout };
