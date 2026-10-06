'use strict';
const store = require('../lib/store');
const { layout } = require('../lib/render');
const { parseForm, sendHtml, redirect, slugify } = require('../lib/http-utils');
const { renderHome } = require('../views/home');
const { renderAbout } = require('../views/about');
const { renderProducts } = require('../views/products');
const { renderProductDetail, detailsFor } = require('../views/product-detail');
const { renderQuality } = require('../views/quality');
const { renderFAQ, faqItems } = require('../views/faq');
const { renderContact } = require('../views/contact');
const { renderCertifications } = require('../views/certifications');
const { renderB2B, b2bFaqs } = require('../views/b2b');
const { findGuide, renderGuide, renderGuidesIndex, GUIDES } = require('../views/guides');
const { sendEnquiryEmail } = require('../lib/mailer');
const { Router } = require('../lib/router');
const seo = require('../lib/seo');

const router = new Router();

function productsDescription(products) {
  const names = products.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((p) => p.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'flour';
  return `Explore the Mamta Bhoj range: ${list}, milled at our Chaubepur, Kanpur facility.`;
}

function nlStatusFromQuery(query) {
  if (query && query.nl === 'sent') return 'sent';
  if (query && query.nl === 'error') return 'error';
  return null;
}

router.get('/', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Mamta Bhoj | Fresh Stone-Ground Chakki Atta, Maida & Sooji',
      description: 'Fresh, naturally stone-ground chakki atta, maida & sooji from Devmam Flourish Foods LLP, Chaubepur, Kanpur. Explore the Mamta Bhoj range.',
      canonicalPath: '/',
      jsonLd: [seo.organizationLd(content), seo.websiteLd()],
      active: 'home',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderHome(content, products),
    })
  );
});

router.get('/about', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Our Story | Devmam Flourish Foods LLP - Mamta Bhoj',
      description: 'Learn about Devmam Flourish Foods LLP, the Chaubepur, Kanpur flour-milling unit behind the Mamta Bhoj range of stone-ground atta, maida and sooji.',
      canonicalPath: '/about',
      jsonLd: [seo.pageLd('AboutPage', 'Our Story', '/about', { about: { '@id': `${seo.SITE_ORIGIN}/#organization` } }), seo.organizationLd(content)],
      active: 'about',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderAbout(content),
    })
  );
});

router.get('/products', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Our Products | Mamta Bhoj Atta, Maida, Sooji & Besan',
      description: productsDescription(products),
      canonicalPath: '/products',
      jsonLd: seo.productListLd(products),
      active: 'products',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderProducts(products, content),
    })
  );
});

router.get('/products/:slug', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
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
  const productTitle = details.seoTitle ? details.seoTitle.replace(' | ', ' - ') : product.name;
  sendHtml(
    res,
    200,
    layout({
      title: `${productTitle} | Mamta Bhoj`,
      description: details.seoDescription || product.description,
      canonicalPath: pagePath,
      ogImage: product.image ? { path: product.image } : null,
      ogImageAlt: product.image ? `Mamta Bhoj ${product.name} pack` : null,
      jsonLd: [
        seo.productLd(product),
        seo.breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Products', path: '/products' },
          { name: product.name, path: pagePath },
        ]),
      ],
      active: 'products',
      content,
      products,
      bodyHtml: renderProductDetail(product, products, content),
    })
  );
});

router.get('/quality', async (req, res, params, query) => {
  const content = store.getContent();
  const gallery = store.listCollection('gallery');
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Quality & Process | Stone-Ground Milling at Mamta Bhoj',
      description: 'See how Mamta Bhoj flour is made: sourcing, cleaning, stone grinding, quality checks and hygienic packing at our Chaubepur, Kanpur mill.',
      canonicalPath: '/quality',
      ogImage: { path: '/images/quality/mamta-bhoj-quality-process-overview.jpg', width: 1536, height: 1024 },
      ogImageAlt: 'Illustrative overview of the Mamta Bhoj flour milling process',
      active: 'quality',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderQuality(content, gallery),
    })
  );
});

router.get('/faq', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'FAQs | Mamta Bhoj Atta, Maida & Sooji',
      description: 'Answers on freshness, stone-grinding, FSSAI and ISO certification, storage, dealership and bulk orders for Mamta Bhoj atta, maida and sooji.',
      canonicalPath: '/faq',
      jsonLd: seo.faqLd(faqItems(content)),
      active: 'faq',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderFAQ(content),
    })
  );
});

router.get('/certifications', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'ISO 9001:2015 & FSSAI Certifications | Mamta Bhoj',
      description: 'ISO 9001:2015 and FSSAI State Licence details for Devmam Flourish Foods LLP (Mamta Bhoj), with links to the official certificate and licence documents.',
      active: 'certifications',
      content,
      products,
      canonicalPath: '/certifications',
      bodyHtml: renderCertifications(content),
    })
  );
});

router.get(seo.MANUFACTURER_PATH, async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Flour Manufacturer in Kanpur | Devmam Flourish Foods LLP',
      description: 'Devmam Flourish Foods LLP mills Mamta Bhoj chakki atta, maida, sooji, tandoori atta and besan in Chaubepur, Kanpur. Enquire about dealership and bulk supply.',
      canonicalPath: seo.MANUFACTURER_PATH,
      // Organization is fully defined on the home and contact pages; here it is
      // referenced by @id so the page does not repeat a second address form.
      jsonLd: [
        seo.pageLd('WebPage', 'Flour Manufacturer & Bulk Flour Supplier in Kanpur', seo.MANUFACTURER_PATH, { about: { '@id': `${seo.SITE_ORIGIN}/#organization` } }),
        seo.breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Flour Manufacturer in Kanpur', path: seo.MANUFACTURER_PATH },
        ]),
        seo.faqLd(b2bFaqs(content)),
      ],
      active: 'b2b',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderB2B(content, products),
    })
  );
});

router.get('/guides', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Flour Guides: Atta, Maida, Sooji & Milling | Mamta Bhoj',
      description: 'Practical guides from Mamta Bhoj on maida vs atta, sooji vs rava, tandoori atta and how wheat flour is made.',
      canonicalPath: '/guides',
      jsonLd: [
        seo.pageLd('CollectionPage', 'Flour guides from Mamta Bhoj', '/guides', {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: seo.absoluteUrl(`/guides/${g.slug}`), name: g.h1 })),
          },
        }),
        seo.breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides' },
        ]),
      ],
      active: 'guides',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderGuidesIndex(content),
    })
  );
});

router.get('/guides/:slug', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
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
      canonicalPath: pagePath,
      jsonLd: [
        seo.articleLd(guide.h1, guide.description, pagePath),
        seo.breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides' },
          { name: guide.shortTitle, path: pagePath },
        ]),
        seo.faqLd(guide.faqs),
      ],
      active: 'guides',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderGuide(guide, products, content),
    })
  );
});

router.get('/contact', async (req, res, params, query) => {
  const content = store.getContent();
  const products = store.listCollection('products');
  sendHtml(
    res,
    200,
    layout({
      title: 'Contact & Dealership Enquiries | Mamta Bhoj',
      description: 'Contact Devmam Flourish Foods LLP in Chaubepur, Kanpur for Mamta Bhoj dealership, distributor, wholesale and bulk enquiries.',
      canonicalPath: '/contact',
      jsonLd: [seo.pageLd('ContactPage', 'Contact', '/contact', { mainEntity: { '@id': `${seo.SITE_ORIGIN}/#organization` } }), seo.organizationLd(content)],
      active: 'contact',
      content,
      products,
      nlStatus: nlStatusFromQuery(query),
      bodyHtml: renderContact(content, query, products),
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

router.get('/robots.txt', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(seo.buildRobotsTxt());
});

router.get('/sitemap.xml', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(seo.buildSitemapXml(store.listCollection('products')));
});

module.exports = router;
