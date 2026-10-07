'use strict';
const store = require('../lib/store');
const { layout, breadcrumbNav } = require('../lib/render');
const { parseForm, sendHtml, redirect, slugify, escapeHtml } = require('../lib/http-utils');
const { renderHome } = require('../views/home');
const { renderAbout } = require('../views/about');
const { renderProducts } = require('../views/products');
const { renderProductDetail, detailsFor } = require('../views/product-detail');
const { renderQuality } = require('../views/quality');
const { renderFAQ } = require('../views/faq');
const { renderContact } = require('../views/contact');
const { renderCertifications } = require('../views/certifications');
const { renderB2B } = require('../views/b2b');
const { findGuide, renderGuide, renderGuidesIndex, GUIDES } = require('../views/guides');
const { B2B_PAGES, renderB2BPage } = require('../views/b2b-pages');
const { sendEnquiryEmail } = require('../lib/mailer');
const { Router } = require('../lib/router');
const seo = require('../lib/seo');
const { INDEXNOW_KEY, INDEXNOW_KEY_PATH } = require('../lib/indexnow');
const { imgSize } = require('../lib/image-dims');
const { withBusinessAddress, withCleanProductCopy } = require('../lib/business');

const router = new Router();

// Breadcrumb trail for the top-level pages: the same items feed the visible
// breadcrumb and the BreadcrumbList schema, so the two can never disagree.
const crumbs = (name, path) => [{ name: 'Home', path: '/' }, { name, path }];

// Public pages always show the authoritative business address (lib/business.js).
function siteContent() {
  return withBusinessAddress(store.getContent());
}

// Public pages show product copy with unsupported phrases removed (lib/business.js).
function siteProducts() {
  return withCleanProductCopy(store.listCollection('products'));
}

function productsDescription(products) {
  const names = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((p) => p.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'flour';
  return `Explore the Mamta Bhoj range: ${list}, milled at our Chaubepur, Kanpur facility.`;
}

// ?sent=1, ?error=1 and ?nl=... are one-off status views of a page, not separate content:
// keep them out of the index (and give them no canonical) instead of leaving
// near-duplicate URLs for search engines to sort out.
const indexing = (query, path) => (query && (query.sent || query.error || query.nl) ? { noindex: true } : { canonicalPath: path });

function nlStatusFromQuery(query) {
  if (query && query.nl === 'sent') return 'sent';
  if (query && query.nl === 'error') return 'error';
  return null;
}

router.get('/', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Mamta Bhoj | Chakki Atta, Maida, Sooji & Besan, Kanpur',
      description: 'Mamta Bhoj by Devmam Flourish Foods LLP: naturally stone-ground chakki atta and tandoori atta, plus maida, sooji and besan, milled in Chaubepur, Kanpur.',
      ...indexing(query, '/'),
      jsonLd: seo.pageGraph(content, { name: 'Mamta Bhoj - Devmam Flourish Foods LLP', description: 'Mamta Bhoj by Devmam Flourish Foods LLP: naturally stone-ground chakki atta and tandoori atta, plus maida, sooji and besan, milled in Chaubepur, Kanpur.', path: '/' }),
      active: 'home',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderHome(content, products, GUIDES),
    })
  );
});

router.get('/about', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Our Story | Devmam Flourish Foods LLP - Mamta Bhoj',
      description: 'Learn about Devmam Flourish Foods LLP, the Chaubepur, Kanpur flour-milling unit behind the Mamta Bhoj range of atta, tandoori atta, maida, sooji and besan.',
      ...indexing(query, '/about'),
      jsonLd: seo.pageGraph(content, { type: 'AboutPage', name: 'Our Story', path: '/about', breadcrumbs: crumbs('Our Story', '/about'), about: { '@id': seo.ORG_ID } }),
      active: 'about',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: breadcrumbNav(crumbs('Our Story', '/about')) + renderAbout(content),
    })
  );
});

router.get('/products', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Our Products | Mamta Bhoj Atta, Maida, Sooji & Besan',
      description: productsDescription(products),
      ...indexing(query, '/products'),
      jsonLd: seo.pageGraph(content, { type: 'CollectionPage', name: 'Mamta Bhoj products', path: '/products', breadcrumbs: crumbs('Products', '/products'), mainEntity: seo.productListNode(products) }),
      active: 'products',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: breadcrumbNav(crumbs('Products', '/products')) + renderProducts(products, content),
    })
  );
});

router.get('/products/:slug', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  const product = products.find((p) => slugify(p.name) === params.slug);

  // Legacy slug (e.g. /products/chakki-atta) -> permanent redirect to the real page.
  if (!product && seo.LEGACY_PRODUCT_SLUGS[params.slug]) {
    const target = products.find((p) => slugify(p.name) === seo.LEGACY_PRODUCT_SLUGS[params.slug]);
    if (target) {
      res.writeHead(301, { Location: seo.absoluteUrl(seo.productPath(target)) });
      res.end();
      return;
    }
  }

  if (!product) {
    sendHtml(
      res,
      404,
      layout({
        title: 'Product Not Found | Mamta Bhoj',
        description: 'This product could not be found.',
        noindex: true,
        active: 'products',
        content,
        products,
        bodyHtml: `<section class="wrap" data-reveal style="padding-block:60px;text-align:center;">
          <span class="eyebrow" style="justify-content:center;">Products</span>
          <h1 style="margin-top:.4em;">We couldn't find that product</h1>
          <p style="margin-top:.7em;">It may have been renamed or is no longer listed. Browse our full range instead.</p>
          <a href="/products" class="btn btn-primary" style="margin-top:1.4em;">View All Products</a>
        </section>`,
      })
    );
    return;
  }

  const details = detailsFor(product);
  const pagePath = seo.productPath(product);
  const productTitle = details.seoTitle || product.name;
  sendHtml(
    res,
    200,
    layout({
      title: `${productTitle} | Mamta Bhoj`,
      description: details.seoDescription || product.description,
      ...indexing(query, pagePath),
      ogImage: product.image ? Object.assign({ path: product.image }, imgSize(product.image)) : null,
      ogImageAlt: product.image ? `Mamta Bhoj ${product.name} pack` : null,
      jsonLd: seo.pageGraph(content, {
        type: 'ItemPage',
        name: `${productTitle} | Mamta Bhoj`,
        description: details.seoDescription || product.description,
        path: pagePath,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Products', path: '/products' },
          { name: product.name, path: pagePath },
        ],
        mainEntity: { '@id': `${seo.absoluteUrl(pagePath)}#product` },
        primaryImage: product.image || null,
        nodes: [seo.productNode(product)],
      }),
      active: 'products',
      content,
      products,
      bodyHtml: renderProductDetail(product, products, content),
    })
  );
});

router.get('/quality', async (req, res, params, query) => {
  const content = siteContent();
  const gallery = store.listCollection('gallery');
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Quality & Process | Stone-Ground Milling at Mamta Bhoj',
      description: 'See how Mamta Bhoj flour is made: sourcing, cleaning, stone grinding, quality checks and hygienic packing at our Chaubepur, Kanpur mill.',
      ...indexing(query, '/quality'),
      jsonLd: seo.pageGraph(content, { name: 'Quality & Process', path: '/quality', breadcrumbs: crumbs('Quality & Process', '/quality'), about: { '@id': seo.ORG_ID } }),
      ogImage: { path: '/images/quality/mamta-bhoj-quality-process-overview.jpg', width: 1536, height: 1024 },
      ogImageAlt: 'Illustrative overview of the Mamta Bhoj flour milling process',
      active: 'quality',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: breadcrumbNav(crumbs('Quality & Process', '/quality')) + renderQuality(content, gallery),
    })
  );
});

router.get('/faq', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'FAQs | Mamta Bhoj Atta, Maida & Sooji',
      description: 'Answers on freshness, stone-grinding, FSSAI and ISO certification, storage, dealership and bulk orders for Mamta Bhoj atta, maida and sooji.',
      ...indexing(query, '/faq'),
      jsonLd: seo.pageGraph(content, { name: 'FAQs', path: '/faq', breadcrumbs: crumbs('FAQs', '/faq'), about: { '@id': seo.ORG_ID } }),
      active: 'faq',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: breadcrumbNav(crumbs('FAQs', '/faq')) + renderFAQ(content),
    })
  );
});

router.get('/certifications', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'ISO 9001:2015 & FSSAI Certifications | Mamta Bhoj',
      description: 'ISO 9001:2015 and FSSAI State Licence details for Devmam Flourish Foods LLP (Mamta Bhoj), with links to the official certificate and licence documents.',
      active: 'certifications',
      content,
      products,
      ...indexing(query, '/certifications'),
      jsonLd: seo.pageGraph(content, { name: 'Certifications', path: '/certifications', breadcrumbs: crumbs('Certifications', '/certifications'), about: { '@id': seo.ORG_ID } }),
      bodyHtml: breadcrumbNav(crumbs('Certifications', '/certifications')) + renderCertifications(content),
    })
  );
});

router.get(seo.MANUFACTURER_PATH, async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Flour Manufacturer in Kanpur | Devmam Flourish Foods LLP',
      description: 'Devmam Flourish Foods LLP mills Mamta Bhoj chakki atta, maida, sooji, tandoori atta and besan in Chaubepur, Kanpur. Enquire about dealership and bulk supply.',
      ...indexing(query, seo.MANUFACTURER_PATH),
      jsonLd: seo.pageGraph(content, {
        name: 'Flour Manufacturer & Bulk Flour Supplier in Kanpur',
        path: seo.MANUFACTURER_PATH,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Flour Manufacturer in Kanpur', path: seo.MANUFACTURER_PATH },
        ],
        about: { '@id': seo.ORG_ID },
      }),
      active: 'b2b',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderB2B(content, products),
    })
  );
});

B2B_PAGES.forEach((page) => {
  const pagePath = `/${page.slug}`;
  router.get(pagePath, async (req, res, params, query) => {
    const content = siteContent();
    const products = siteProducts();
    sendHtml(
      res,
      200,
      layout({
        title: page.title,
        description: page.description,
        ...indexing(query, pagePath),
        jsonLd: seo.pageGraph(content, {
          name: page.h1,
          description: page.description,
          path: pagePath,
          breadcrumbs: [
            { name: 'Home', path: '/' },
            { name: page.crumb || page.eyebrow, path: pagePath },
          ],
          about: { '@id': seo.ORG_ID },
        }),
        active: 'b2b',
        content,
        products,
        nlStatus: nlStatusFromQuery(query),
        bodyHtml: renderB2BPage(page, content, products),
      })
    );
  });
});

router.get('/guides', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Flour Guides: Atta, Maida, Sooji & Milling | Mamta Bhoj',
      description: 'Practical guides from Mamta Bhoj: how to choose atta, types of flour, storing flour, maida vs atta, sooji vs rava and buying flour in bulk.',
      ...indexing(query, '/guides'),
      jsonLd: seo.pageGraph(content, {
        type: 'CollectionPage',
        name: 'Flour guides from Mamta Bhoj',
        path: '/guides',
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides' },
        ],
        mainEntity: seo.itemListNode('Mamta Bhoj flour guides', GUIDES.map((g) => ({ path: `/guides/${g.slug}`, name: g.h1 }))),
      }),
      active: 'guides',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderGuidesIndex(content),
    })
  );
});

router.get('/guides/:slug', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  const guide = findGuide(params.slug);

  if (!guide) {
    sendHtml(
      res,
      404,
      layout({
        title: 'Guide Not Found | Mamta Bhoj',
        description: 'This guide could not be found.',
        noindex: true,
        active: 'guides',
        content,
        products,
        bodyHtml: `<section class="wrap" data-reveal style="padding-block:60px;text-align:center;">
          <span class="eyebrow" style="justify-content:center;">Guides</span>
          <h1 style="margin-top:.4em;">We couldn't find that guide</h1>
          <p style="margin-top:.7em;">Browse all of our flour guides instead.</p>
          <a href="/guides" class="btn btn-primary" style="margin-top:1.4em;">View All Guides</a>
        </section>`,
      })
    );
    return;
  }

  const pagePath = `/guides/${guide.slug}`;
  sendHtml(
    res,
    200,
    layout({
      title: guide.title,
      description: guide.description,
      ...indexing(query, pagePath),
      jsonLd: seo.pageGraph(content, {
        name: guide.h1,
        description: guide.description,
        path: pagePath,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides' },
          { name: guide.shortTitle, path: pagePath },
        ],
        mainEntity: { '@id': `${seo.absoluteUrl(pagePath)}#article` },
        nodes: [seo.articleNode(guide.h1, guide.description, pagePath)],
      }),
      active: 'guides',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderGuide(guide, products, content),
    })
  );
});

router.get('/contact', async (req, res, params, query) => {
  const content = siteContent();
  const products = siteProducts();
  sendHtml(
    res,
    200,
    layout({
      title: 'Contact & Dealership Enquiries | Mamta Bhoj',
      description: 'Contact Devmam Flourish Foods LLP in Chaubepur, Kanpur for Mamta Bhoj dealership, distributor, wholesale and bulk enquiries.',
      ...indexing(query, '/contact'),
      jsonLd: seo.pageGraph(content, { type: 'ContactPage', name: 'Contact', path: '/contact', breadcrumbs: crumbs('Contact', '/contact'), mainEntity: { '@id': seo.ORG_ID } }),
      active: 'contact',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: breadcrumbNav(crumbs('Contact', '/contact')) + renderContact(content, query, products),
    })
  );
});

router.post('/contact', async (req, res) => {
  const body = await parseForm(req);
  const name = (body.name || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const type = (body.type || '').toString().trim();
  const productInterest = (body.productInterest || '').toString().trim();
  const monthlyRequirement = (body.monthlyRequirement || '').toString().trim();
  const cityState = (body.cityState || '').toString().trim();
  const message = (body.message || '').toString().trim();

  if (!name || !phone || !type || !productInterest) {
    return redirect(res, '/contact?error=1');
  }

  const enquiry = store.insertRow('enquiries', {
    name,
    phone,
    type,
    productInterest,
    monthlyRequirement,
    cityState,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });

  // The enquiry is already safely stored above regardless of what happens
  // next — sendEnquiryEmail never throws, so a mail failure can't turn a
  // successful submission into an error for the visitor.
  await sendEnquiryEmail(enquiry);

  redirect(res, '/contact?sent=1');
});

router.post('/newsletter', async (req, res) => {
  const body = await parseForm(req);
  const email = (body.email || '').toString().trim();
  const back = (req.headers.referer && new URL(req.headers.referer, 'http://x').pathname) || '/';

  if (!email || email.indexOf('@') === -1) {
    return redirect(res, back + '?nl=error');
  }

  store.insertRow('newsletter', {
    email,
    createdAt: new Date().toISOString(),
  });

  redirect(res, back + '?nl=sent');
});

// IndexNow ownership key file (public by design; see lib/indexnow.js). Not in the sitemap.
router.get(INDEXNOW_KEY_PATH, async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  res.end(INDEXNOW_KEY);
});

router.get('/robots.txt', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(seo.buildRobotsTxt());
});

router.get('/sitemap.xml', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(seo.buildSitemapXml(store.listCollection('products')));
});

// Branded 404 for unknown URLs (server.js sends it with a real 404 status). It is
// noindex and links back into the main sections of the site.
router.renderNotFound = function renderNotFound() {
  const content = siteContent();
  const products = siteProducts();
  const productLinks = products
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((p) => `<li><a href="${seo.productPath(p)}">${escapeHtml(p.name)}</a></li>`)
    .join('');
  return layout({
    title: 'Page Not Found | Mamta Bhoj',
    description: 'The page you requested could not be found.',
    noindex: true,
    active: '',
    content,
    products,
    bodyHtml: `<section class="page-hero wrap" data-reveal style="text-align:center;">
      <span class="eyebrow" style="justify-content:center;">Error 404</span>
      <h1>We couldn't find that page</h1>
      <p>The address may be mistyped or the page may have moved. These pages may help.</p>
      <div class="hero-cta" style="justify-content:center;margin-top:1.4em;"><a href="/" class="btn btn-primary">Go to the Home Page</a><a href="/products" class="btn btn-ghost">View Products</a></div>
    </section>
    <section class="wrap" data-reveal>
      <div class="prose">
        <h2>Popular pages</h2>
        <ul class="prose-list">${productLinks}<li><a href="/flour-manufacturer-india">Flour manufacturer in India</a></li><li><a href="/guides">Flour guides</a></li><li><a href="/contact">Contact and enquiries</a></li></ul>
      </div>
    </section>`,
  });
};

module.exports = router;
