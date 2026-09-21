'use strict';
const store = require('../lib/store');
const { layout } = require('../lib/render');
const { parseForm, sendHtml, redirect, slugify } = require('../lib/http-utils');
const { renderHome } = require('../views/home');
const { renderAbout } = require('../views/about');
const { renderProducts } = require('../views/products');
const { renderProductDetail, detailsFor } = require('../views/product-detail');
const { renderQuality } = require('../views/quality');
const { renderFAQ } = require('../views/faq');
const { renderContact } = require('../views/contact');
const { renderCertifications } = require('../views/certifications');
const { sendEnquiryEmail } = require('../lib/mailer');
const { Router } = require('../lib/router');

function requestOrigin(req) {
  const proto = process.env.FORCE_HTTPS === '1' ? 'https' : 'http';
  return `${proto}://${req.headers.host}`;
}

const router = new Router();

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
      title: 'Home',
      description: 'Fresh, naturally stone-ground chakki atta, maida & sooji from Devmam Flourish Foods LLP, Chaubepur, Kanpur.',
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
      title: 'Our Story',
      description: 'About Devmam Flourish Foods LLP and the Mamta Bhoj flour range.',
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
      title: 'Products',
      description: 'Chakki Atta, Maida and Sooji from Mamta Bhoj.',
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

  if (!product) {
    sendHtml(
      res,
      404,
      layout({
        title: 'Product Not Found',
        description: 'This product could not be found.',
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

  const seo = detailsFor(product);
  sendHtml(
    res,
    200,
    layout({
      title: seo.seoTitle || product.name,
      description: seo.seoDescription || product.description,
      active: 'products',
      content,
      products,
      canonical: `${requestOrigin(req)}/products/${params.slug}`,
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
      title: 'Quality & Process',
      description: 'How Mamta Bhoj mills fresh, naturally stone-ground flour.',
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
      title: 'FAQs',
      description: 'Frequently asked questions about Mamta Bhoj atta, maida and sooji.',
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
      title: 'Certifications & Compliance',
      description: 'ISO 9001:2015 and FSSAI State Licence certification details for Devmam Flourish Foods LLP (Mamta Bhoj), with links to the official certificate and licence documents.',
      active: 'certifications',
      content,
      products,
      canonical: `${requestOrigin(req)}/certifications`,
      bodyHtml: renderCertifications(content),
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
      title: 'Contact',
      description: 'Get in touch with Devmam Flourish Foods LLP for dealership and bulk enquiries.',
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

module.exports = router;
