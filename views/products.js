'use strict';
const { productCard } = require('./home');
const { detailsFor } = require('./product-detail');
const { ctaBand, wheatDividerBand } = require('../lib/render');
const { escapeHtml, slugify } = require('../lib/http-utils');
const { packSizesText } = require('../lib/business');

const glanceValue = (details, key) => ((details.glance || []).find(([k]) => k === key) || [])[1] || '';

function renderProducts(products, content) {
  const sorted = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const compareRows = sorted
    .map((p) => {
      const d = detailsFor(p);
      return `<tr><th scope="row"><a href="/products/${slugify(p.name)}">${escapeHtml(p.name)}</a></th><td>${escapeHtml(glanceValue(d, 'Made from'))}</td><td>${escapeHtml(glanceValue(d, 'Best for'))}</td></tr>`;
    })
    .join('');
  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Our Range</span>
  <h1>Fresh from the mill</h1>
  <p>Every product under the Mamta Bhoj name is naturally stone-ground, hygienically packed, and milled in small, frequent batches so it reaches you fresh.</p>
</section>
${wheatDividerBand()}
<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Five Flours</span><h2>The Mamta Bhoj range</h2></div>
  <div class="product-grid">
    ${sorted.map((p) => productCard(p)).join('') || '<p>Products will be listed here shortly.</p>'}
  </div>
</section>
${
  sorted.length
    ? `<section class="wrap" data-reveal>
  <div class="prose">
    <h2>Which Mamta Bhoj flour for which job?</h2>
    <p>Five flours, each made for different cooking. Every one is available in ${escapeHtml(packSizesText())} packs. Open a product to see its details, questions and how to enquire.</p>
    <div class="compare-wrap"><table class="compare">
      <thead><tr><th scope="col">Product</th><th scope="col">Made from</th><th scope="col">Best for</th></tr></thead>
      <tbody>${compareRows}</tbody>
    </table></div>
    <p>Not sure which flour you need? Our guides on the <a class="inline-link" href="/guides/types-of-flour-in-india">types of flour in India</a>, <a class="inline-link" href="/guides/how-to-choose-atta">how to choose atta</a> and <a class="inline-link" href="/guides/maida-vs-atta">maida vs atta</a> explain the differences, and <a class="inline-link" href="/guides/how-to-store-flour">how to store flour</a> keeps it fresh once you have it.</p>
    <h2>Buying for a shop, bakery or kitchen?</h2>
    <p>Read about <a class="inline-link" href="/bulk-flour-supplier-india">bulk flour supply</a>, <a class="inline-link" href="/wholesale-flour-supplier">wholesale supply for dealers and retailers</a> or <a class="inline-link" href="/institutional-flour-supplier">institutional supply for kitchens and bakeries</a>. To see who makes the flour, read about Devmam Flourish Foods as a <a class="inline-link" href="/flour-manufacturer-kanpur">flour manufacturer in Kanpur</a> and our <a class="inline-link" href="/flour-manufacturer-india">atta, maida, sooji and besan manufacturer overview</a> for buyers across India. Or go straight to the <a class="inline-link" href="/contact">enquiry form</a>.</p>
  </div>
</section>`
    : ''
}
${ctaBand(content)}
`;
}

module.exports = { renderProducts };
