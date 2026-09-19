'use strict';
const { productCard } = require('./home');
const { ctaBand, wheatDividerBand } = require('../lib/render');

function renderProducts(products, content) {
  const sorted = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return `
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Our Range</span>
  <h1>Fresh from the mill</h1>
  <p>Every product under the Mamta Bhoj name is naturally stone-ground, hygienically packed, and milled in small, frequent batches so it reaches you fresh.</p>
</section>
${wheatDividerBand()}
<section class="wrap" data-reveal>
  <div class="product-grid">
    ${sorted.map((p) => productCard(p)).join('') || '<p>Products will be listed here shortly.</p>'}
  </div>
</section>
${ctaBand(content)}
`;
}

module.exports = { renderProducts };
