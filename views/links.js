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
    slug: 'bulk-flour-supplier-india',
    name: 'Bulk flour supply',
    cardTitle: 'Bulk flour supply',
    cardText: 'For bakeries, sweet shops, caterers and food makers that need flour in volume.',
    enquiryType: 'Wholesale / Bulk Purchase',
  },
  {
    slug: 'wholesale-flour-supplier',
    name: 'Wholesale supply for dealers and retailers',
    cardTitle: 'Wholesale for dealers and retailers',
    cardText: 'Branded atta, maida, sooji and besan for resale, in 1 kg, 2 kg and 5 kg packs.',
    enquiryType: 'Wholesale / Bulk Purchase',
  },
  {
    slug: 'institutional-flour-supplier',
    name: 'Institutional supply for kitchens and bakeries',
    cardTitle: 'Institutional supply',
    cardText: 'For restaurants, canteens, hostels and bakeries: which flour suits which kitchen.',
    enquiryType: 'Institutional / HoReCa',
  },
  {
    slug: 'supply-distribution-india',
    name: 'Supply and distribution enquiries from across India',
    cardTitle: 'Supply and distribution across India',
    cardText: 'Dealers and distributors in other states: how to start the conversation.',
    enquiryType: 'Distributorship',
  },
];

if (B2B_LINKS.map((l) => l.slug).join() !== seo.B2B_PAGE_SLUGS.join()) {
  throw new Error('views/links.js B2B_LINKS and lib/seo.js B2B_PAGE_SLUGS are out of sync');
}

const b2bMeta = (slug) => B2B_LINKS.find((l) => l.slug === slug) || null;
const enquiryHref = (type, product) =>
  `/contact?${product ? `product=${encodeURIComponent(product)}&` : ''}type=${encodeURIComponent(type)}`;

const a = (href, text) => `<a class="inline-link" href="${href}">${text}</a>`;
const B2BLINK = (slug, text) => a(`/${slug}`, text);
const PRODLINK = (slug, text) => a(`/products/${slug}`, text);
const GUIDELINK = (slug, text) => a(`/guides/${slug}`, text);
const MFRLINK = (text) => a(seo.MANUFACTURER_PATH, text);
const CONTACTLINK = (text, type) => a(type ? enquiryHref(type) : '/contact', text);

module.exports = { B2B_LINKS, b2bMeta, enquiryHref, LINK: a, B2BLINK, PRODLINK, GUIDELINK, MFRLINK, CONTACTLINK };
