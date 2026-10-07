'use strict';
// Shared link helpers and B2B page metadata. Kept free of view imports so any
// view (home, products, product pages, guides, B2B pages) can use it without
// creating circular requires.
const seo = require('../lib/seo');

// One entry per B2B supply page: card copy used wherever the pages are linked
// (home, manufacturer page, product pages, other B2B pages). Order must match
// seo.B2B_PAGE_SLUGS.
const B2B_LINKS = [
  {
    slug: 'flour-manufacturer-india',
    name: 'Flour manufacturer in India: atta, maida, sooji and besan',
    cardTitle: 'Flour manufacturer for India',
    cardText: 'The five Mamta Bhoj flours, what each is made for, and how to evaluate a manufacturer before you buy.',
    enquiryType: 'Wholesale / Bulk Purchase',
    anchors: ['an atta, maida, sooji and besan manufacturer', 'our manufacturer overview for buyers across India', 'how to source these flours from a Kanpur mill'],
  },
  {
    slug: 'bulk-flour-supplier-india',
    name: 'Bulk flour supply',
    cardTitle: 'Bulk flour supply',
    cardText: 'For bakeries, sweet shops, caterers and food makers that need flour in volume.',
    enquiryType: 'Wholesale / Bulk Purchase',
    anchors: ['bulk flour supply', 'buying flour in volume', 'our bulk supply page'],
  },
  {
    slug: 'wholesale-flour-supplier',
    name: 'Wholesale supply for dealers and retailers',
    cardTitle: 'Wholesale for dealers and retailers',
    cardText: 'Branded atta, maida, sooji and besan for resale, in 1 kg, 2 kg and 5 kg packs.',
    enquiryType: 'Wholesale / Bulk Purchase',
    anchors: ['wholesale supply for dealers and retailers', 'stocking Mamta Bhoj for resale', 'our wholesale page'],
  },
  {
    slug: 'institutional-flour-supplier',
    name: 'Institutional supply for kitchens and bakeries',
    cardTitle: 'Institutional supply',
    cardText: 'For restaurants, canteens, hostels and bakeries: which flour suits which kitchen.',
    enquiryType: 'Institutional / HoReCa',
    anchors: ['institutional supply for kitchens and bakeries', 'flour for restaurants, canteens and caterers', 'our institutional supply page'],
  },
  {
    slug: 'supply-distribution-india',
    name: 'Supply and distribution enquiries from across India',
    cardTitle: 'Supply and distribution across India',
    cardText: 'Dealers and distributors in other states: how to start the conversation.',
    enquiryType: 'Distributorship',
    anchors: ['supply and distribution enquiries from other states', 'becoming a dealer or distributor', 'our distribution enquiries page'],
  },
];

if (B2B_LINKS.map((l) => l.slug).join() !== seo.B2B_PAGE_SLUGS.join()) {
  throw new Error('views/links.js B2B_LINKS and lib/seo.js B2B_PAGE_SLUGS are out of sync');
}

const b2bMeta = (slug) => B2B_LINKS.find((l) => l.slug === String(slug).split('#')[0]) || null;
// Varied, natural anchor text for a B2B page: the same page is not linked with the
// same words everywhere. `n` is any stable number (e.g. the index of the linking page).
const b2bAnchor = (slug, n) => {
  const m = b2bMeta(slug);
  return m ? m.anchors[Math.abs(n || 0) % m.anchors.length] : '';
};
const enquiryHref = (type, product) =>
  `/contact?${product ? `product=${encodeURIComponent(product)}&` : ''}type=${encodeURIComponent(type)}`;

const a = (href, text) => `<a class="inline-link" href="${href}">${text}</a>`;
const B2BLINK = (slug, text) => a(`/${slug}`, text);
const PRODLINK = (slug, text) => a(`/products/${slug}`, text);
const GUIDELINK = (slug, text) => a(`/guides/${slug}`, text);
const MFRLINK = (text) => a(seo.MANUFACTURER_PATH, text);
const CONTACTLINK = (text, type) => a(type ? enquiryHref(type) : '/contact', text);

module.exports = { B2B_LINKS, b2bMeta, b2bAnchor, enquiryHref, LINK: a, B2BLINK, PRODLINK, GUIDELINK, MFRLINK, CONTACTLINK };
