'use strict';
const store = require('../lib/store');
const { layout } = require('../lib/render');
const { parseForm, sendHtml, redirect } = require('../lib/http-utils');
const { renderHome } = require('../views/home');
const { renderAbout } = require('../views/about');
const { renderProducts } = require('../views/products');
const { renderQuality } = require('../views/quality');
const { renderFAQ } = require('../views/faq');
const { renderContact } = require('../views/contact');
const { Router } = require('../lib/router');

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
      bodyHtml: renderContact(content, query),
    })
  );
});

router.post('/contact', async (req, res) => {
  const body = await parseForm(req);
  const name = (body.name || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const message = (body.message || '').toString().trim();
  const type = (body.type || 'General Enquiry').toString().trim();

  if (!name || !phone || !message) {
    return redirect(res, '/contact?error=1');
  }

  store.insertRow('enquiries', {
    name,
    phone,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });

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
