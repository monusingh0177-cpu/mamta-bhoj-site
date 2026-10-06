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
];
// B2B supply pages (views/b2b-pages.js asserts it stays in sync with this list).
const B2B_PAGE_SLUGS = ['bulk-flour-supplier-india', 'wholesale-flour-supplier', 'institutional-flour-supplier', 'supply-distribution-india'];
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

function organizationLd(content) {
  const c = content || {};
  const phone = (c.phone || '').trim();
  const email = (c.email || '').trim();
  const address = postalAddress(c.address);
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: LEGAL_NAME,
    alternateName: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: absoluteUrl(LOGO_PATH),
  };
  if (address) org.address = address;
  if (phone || email) {
    const point = { '@type': 'ContactPoint', contactType: 'customer service' };
    if (phone) point.telephone = phone;
    if (email) point.email = email;
    org.contactPoint = point;
  }
  return org;
}

function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    inLanguage: 'en-IN',
  };
}

// Product schema from existing facts only. This is an enquiry-only site: no
// verified price, offers, availability, rating, review, SKU, GTIN or MPN
// exist for these products, so none are emitted (no Offer object at all).
function productLd(product) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${BRAND_NAME} ${product.name}`,
    description: product.description,
    brand: { '@type': 'Brand', name: BRAND_NAME },
    url: absoluteUrl(productPath(product)),
    // Owner-confirmed and shown on the page as "Available Pack Sizes".
    additionalProperty: [{ '@type': 'PropertyValue', name: 'Available pack sizes', value: packSizesText() }],
  };
  if (product.image) data.image = absoluteUrl(product.image);
  return data;
}

// Small, self-contained Organization / WebSite nodes for use inside other
// schema (Article author/publisher, WebPage about/isPartOf). Google reads each
// page's markup on its own, so a bare {"@id": ...} reference to an entity that
// is only defined on another page resolves to nothing; these carry the same
// @id plus the verified basics (no address, so there is only ever one full
// address definition, in organizationLd()).
function orgRefLd() {
  return { '@type': 'Organization', '@id': `${SITE_ORIGIN}/#organization`, name: LEGAL_NAME, alternateName: BRAND_NAME, url: `${SITE_ORIGIN}/`, logo: absoluteUrl(LOGO_PATH) };
}

function siteRefLd() {
  return { '@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, name: BRAND_NAME, url: `${SITE_ORIGIN}/` };
}

// Plain page-type markup for pages whose content genuinely supports it.
function pageLd(type, name, path, extra) {
  return Object.assign({ '@context': 'https://schema.org', '@type': type, name, url: absoluteUrl(path), isPartOf: siteRefLd() }, extra || {});
}

// Listing of the products shown on /products (names + URLs only).
function productListLd(products) {
  const sorted = (products || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${BRAND_NAME} products`,
    itemListElement: sorted.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(productPath(p)), name: `${BRAND_NAME} ${p.name}` })),
  };
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

// Informational article. Author/publisher are the company itself (inline, so
// they resolve on this page); no dates are emitted because none are recorded
// for these guides.
function articleLd(headline, description, path, image) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    mainEntityOfPage: absoluteUrl(path),
    image: absoluteUrl((image && image.path) || DEFAULT_OG_IMAGE.path),
    author: orgRefLd(),
    publisher: orgRefLd(),
    inLanguage: 'en-IN',
  };
}

function faqLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

module.exports = {
  SITE_ORIGIN,
  CANONICAL_HOST,
  GUIDE_SLUGS,
  B2B_PAGE_SLUGS,
  MANUFACTURER_PATH,
  articleLd,
  orgRefLd,
  LEGACY_PRODUCT_SLUGS,
  pageLd,
  productListLd,
  BRAND_NAME,
  DEFAULT_OG_IMAGE,
  absoluteUrl,
  productPath,
  sitemapPaths,
  buildSitemapXml,
  buildRobotsTxt,
  jsonLdScript,
  organizationLd,
  websiteLd,
  productLd,
  breadcrumbLd,
  faqLd,
};
