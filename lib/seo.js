'use strict';
// Central SEO helpers: canonical origin, absolute URLs, robots/sitemap
// builders and JSON-LD builders. Every fact used here is read from existing
// site data (data/content.json, data/products.json) or from facts already
// published on the site — nothing is invented (no ratings, prices, opening
// hours, coordinates or social profiles).
const { escapeHtml, slugify } = require('./http-utils');
const { packSizesText } = require('./business');

// Canonical public origin. Deliberately NOT derived from the request's Host
// header, so http/www/preview hostnames can never leak into canonical URLs.
const SITE_ORIGIN = 'https://devmamflourishfoods.com';
const CANONICAL_HOST = 'devmamflourishfoods.com';
// Old/incorrect product slugs that Google (or external links) may still
// request. Each 301-redirects to the product's real slug.
const LEGACY_PRODUCT_SLUGS = { 'chakki-atta': 'fresh-chakki-atta' };
const BRAND_NAME = 'Mamta Bhoj';
const LEGAL_NAME = 'Devmam Flourish Foods LLP';
const LOGO_PATH = '/images/mamta-bhoj-premium-logo.png';
// Approved existing artwork used as the default social-preview image.
const DEFAULT_OG_IMAGE = { path: '/images/facility/mamta-bhoj-facility-overview.jpg', width: 1536, height: 1024 };

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return SITE_ORIGIN + '/';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return SITE_ORIGIN + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}

// Guide slugs live here (not in views/guides.js) so the sitemap can list them
// without importing the view layer; views/guides.js asserts both stay in sync.
const GUIDE_SLUGS = [
  'maida-vs-atta', 'sooji-vs-rava', 'tandoori-atta-guide', 'how-flour-is-made',
  'chakki-atta-vs-roller-milled-atta', 'what-is-maida', 'what-is-besan', 'how-to-choose-flour-supplier',
  // Phase 3
  'how-to-choose-atta', 'types-of-flour-in-india', 'how-to-store-flour',
  'bulk-flour-procurement-guide',
];
// B2B supply pages (views/b2b-pages.js asserts it stays in sync with this list).
// 'flour-manufacturer-india' is the product-by-product manufacturer overview that
// sits between the Kanpur manufacturer page and the supply pages.
const B2B_PAGE_SLUGS = ['flour-manufacturer-india', 'bulk-flour-supplier-india', 'wholesale-flour-supplier', 'institutional-flour-supplier', 'supply-distribution-india'];
const MANUFACTURER_PATH = '/flour-manufacturer-kanpur';

// Static public pages that belong in the sitemap (path only).
const STATIC_PUBLIC_PATHS = [
  '/', '/about', '/products', '/quality', '/faq', '/certifications', '/contact',
  MANUFACTURER_PATH, ...B2B_PAGE_SLUGS.map((s) => `/${s}`), '/guides', ...GUIDE_SLUGS.map((s) => `/guides/${s}`),
];

function productPath(product) {
  return `/products/${slugify(product.name)}`;
}

function sitemapPaths(products) {
  const sorted = (products || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const all = STATIC_PUBLIC_PATHS.concat(sorted.map(productPath));
  return Array.from(new Set(all));
}

function buildSitemapXml(products) {
  const urls = sitemapPaths(products)
    .map((p) => `  <url>\n    <loc>${escapeHtml(absoluteUrl(p === '/' ? '/' : p))}</loc>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
}

// JSON-LD must never be able to close its own <script> tag.
function jsonLdScript(objects) {
  const list = (Array.isArray(objects) ? objects : [objects]).filter(Boolean);
  return list
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`)
    .join('\n');
}

// "Gata No. 402, Village Malau, Chaubepur, Tehsil Bilhaur, Kanpur Nagar,
// Uttar Pradesh – 209203" -> PostalAddress.
// Returns null (so the field is omitted) if the editable address text does
// not follow that shape, rather than guessing.
function postalAddress(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const last = /^(.+?)\s*[–-]\s*(\d{6})$/.exec(parts[parts.length - 1]);
  if (!last) return null;
  return {
    '@type': 'PostalAddress',
    streetAddress: parts.slice(0, parts.length - 2).join(', '),
    addressLocality: parts[parts.length - 2],
    addressRegion: last[1],
    postalCode: last[2],
    addressCountry: 'IN',
  };
}

// ---------------------------------------------------------------------------
// Structured data: one JSON-LD @graph per page, connected by @id.
//
//   Organization  (#organization)  the company; full address, logo, contact
//   WebSite       (#website)       publisher -> Organization
//   WebPage       (<url>#webpage)  isPartOf -> WebSite, breadcrumb -> BreadcrumbList
//   BreadcrumbList(<url>#breadcrumb)
//   Product / Article / ItemList   only on the pages whose visible content they describe
//
// Every @id that is referenced is defined in the same graph, so nothing depends on
// another page. Only facts that are published on the site are used: no offers,
// prices, ratings, reviews, SKU/GTIN, areaServed, opening hours, geo or sameAs.
// FAQPage is deliberately not emitted: FAQ rich results are no longer shown for
// ordinary sites, so the markup would only add noise; the FAQs stay visible as HTML.
// ---------------------------------------------------------------------------
const ORG_ID = `${SITE_ORIGIN}/#organization`;
const SITE_ID = `${SITE_ORIGIN}/#website`;
const LOGO_ID = `${SITE_ORIGIN}/#logo`;
const LOGO_SIZE = { width: 320, height: 230 };
const ORG_DESCRIPTION = 'Flour mill at Chaubepur, Kanpur Nagar, Uttar Pradesh that makes the Mamta Bhoj range of chakki atta, tandoori atta, maida, sooji and besan.';

function organizationNode(content) {
  const c = content || {};
  const phone = (c.phone || '').trim();
  const email = (c.email || '').trim();
  const address = postalAddress(c.address);
  const org = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: LEGAL_NAME,
    legalName: LEGAL_NAME,
    alternateName: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: { '@type': 'ImageObject', '@id': LOGO_ID, url: absoluteUrl(LOGO_PATH), contentUrl: absoluteUrl(LOGO_PATH), width: LOGO_SIZE.width, height: LOGO_SIZE.height },
    description: ORG_DESCRIPTION,
  };
  if (address) org.address = address;
  if (phone) org.telephone = phone;
  if (email) org.email = email;
  if (phone || email) {
    const point = { '@type': 'ContactPoint', contactType: 'customer service' };
    if (phone) point.telephone = phone;
    if (email) point.email = email;
    org.contactPoint = point;
  }
  return org;
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-IN',
  };
}

const pageNodeId = (path) => `${absoluteUrl(path)}#webpage`;
const crumbNodeId = (path) => `${absoluteUrl(path)}#breadcrumb`;

// WebPage (or a more specific page type such as AboutPage, ContactPage, CollectionPage, ItemPage).
function webPageNode({ type, name, description, path, breadcrumbs, about, mainEntity, primaryImage }) {
  const node = {
    '@type': type || 'WebPage',
    '@id': pageNodeId(path),
    url: absoluteUrl(path),
    name,
    isPartOf: { '@id': SITE_ID },
    inLanguage: 'en-IN',
  };
  if (description) node.description = description;
  if (breadcrumbs && breadcrumbs.length) node.breadcrumb = { '@id': crumbNodeId(path) };
  if (about) node.about = about;
  if (mainEntity) node.mainEntity = mainEntity;
  if (primaryImage) node.primaryImageOfPage = { '@type': 'ImageObject', url: absoluteUrl(primaryImage) };
  return node;
}

function breadcrumbNode(items, path) {
  return {
    '@type': 'BreadcrumbList',
    '@id': crumbNodeId(path),
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

// Product schema from existing facts only. This is an enquiry-only site: no
// verified price, offers, availability, rating, review, SKU, GTIN or MPN
// exist for these products, so none are emitted (no Offer object at all).
function productNode(product) {
  const path = productPath(product);
  const data = {
    '@type': 'Product',
    '@id': `${absoluteUrl(path)}#product`,
    name: `${BRAND_NAME} ${product.name}`,
    description: product.description,
    brand: { '@type': 'Brand', name: BRAND_NAME },
    // Devmam Flourish Foods LLP mills and packs every product at its own Kanpur unit.
    manufacturer: { '@id': ORG_ID },
    url: absoluteUrl(path),
    mainEntityOfPage: { '@id': pageNodeId(path) },
    // Owner-confirmed and shown on the page as "Available Pack Sizes".
    additionalProperty: [{ '@type': 'PropertyValue', name: 'Available pack sizes', value: packSizesText() }],
  };
  if (product.image) data.image = absoluteUrl(product.image);
  return data;
}

// Informational article. Author/publisher are the company itself; no dates are
// emitted because none are recorded for these guides.
function articleNode(headline, description, path, image) {
  return {
    '@type': 'Article',
    '@id': `${absoluteUrl(path)}#article`,
    headline,
    description,
    mainEntityOfPage: { '@id': pageNodeId(path) },
    image: absoluteUrl((image && image.path) || DEFAULT_OG_IMAGE.path),
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-IN',
  };
}

function itemListNode(name, items) {
  return {
    '@type': 'ItemList',
    name,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(it.path), name: it.name })),
  };
}

// Listing of the products shown on /products (names + URLs only).
function productListNode(products) {
  const sorted = (products || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return itemListNode(`${BRAND_NAME} products`, sorted.map((p) => ({ path: productPath(p), name: `${BRAND_NAME} ${p.name}` })));
}

// The full per-page graph. `opts`: { type, name, description, path, breadcrumbs, about, mainEntity,
// primaryImage, nodes: [extra nodes such as Product / Article] }.
function pageGraph(content, opts) {
  const nodes = [
    organizationNode(content),
    websiteNode(),
    webPageNode(opts),
    opts.breadcrumbs && opts.breadcrumbs.length ? breadcrumbNode(opts.breadcrumbs, opts.path) : null,
  ].concat(opts.nodes || []).filter(Boolean);
  return { '@context': 'https://schema.org', '@graph': nodes };
}

module.exports = {
  SITE_ORIGIN,
  CANONICAL_HOST,
  GUIDE_SLUGS,
  B2B_PAGE_SLUGS,
  MANUFACTURER_PATH,
  LEGACY_PRODUCT_SLUGS,
  BRAND_NAME,
  ORG_ID,
  SITE_ID,
  DEFAULT_OG_IMAGE,
  absoluteUrl,
  productPath,
  sitemapPaths,
  buildSitemapXml,
  buildRobotsTxt,
  jsonLdScript,
  pageGraph,
  productNode,
  articleNode,
  itemListNode,
  productListNode,
};
