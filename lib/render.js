'use strict';
const { escapeHtml } = require('./http-utils');
const { wheatDivider, journeyIcons } = require('./icons');

const NAV_ITEMS = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/about', label: 'Our Story', key: 'about' },
  { href: '/products', label: 'Products', key: 'products' },
  { href: '/quality', label: 'Quality &amp; Process', key: 'quality' },
  { href: '/faq', label: 'FAQs', key: 'faq' },
  { href: '/contact', label: 'Contact', key: 'contact' },
];

// Original wheat-sheaf seal mark (own design, no resemblance to any real
// brand's logo). fixed=true swaps in hardcoded white/ice-blue for the
// site's permanently-dark bands (footer); the default uses theme tokens so
// it adapts to light/dark mode on the page's own surface.
function logoMark(size, fixed) {
  const ring1 = fixed ? '#ffffff' : 'var(--red)';
  const ring2 = fixed ? '#ffffff' : 'var(--gold)';
  const stem = fixed ? '#ffffff' : 'var(--ink)';
  const leaf = fixed ? '#bcd9f5' : 'var(--gold)';
  const tip = fixed ? '#ffffff' : 'var(--red)';
  const base = fixed ? '#ffffff' : 'var(--red)';
  const leafPath = 'M0 0 C 3 -2.3 6.3 -2.3 10 0 C 6.3 2.3 3 2.3 0 0 Z';
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="20" cy="20" r="19" fill="none" stroke="${ring1}" stroke-width="1.6"/>
    <circle cx="20" cy="20" r="14.5" fill="none" stroke="${ring2}" stroke-width="1"/>
    <line x1="20" y1="29" x2="20" y2="11" stroke="${stem}" stroke-width="1.2" stroke-linecap="round"/>
    <g fill="${leaf}">
      <g transform="translate(20,26) rotate(-145)"><path d="${leafPath}"/></g>
      <g transform="translate(20,26) rotate(-35)"><path d="${leafPath}"/></g>
      <g transform="translate(20,20.5) rotate(-150) scale(.85)"><path d="${leafPath}"/></g>
      <g transform="translate(20,20.5) rotate(-30) scale(.85)"><path d="${leafPath}"/></g>
      <g transform="translate(20,15) rotate(-155) scale(.7)"><path d="${leafPath}"/></g>
      <g transform="translate(20,15) rotate(-25) scale(.7)"><path d="${leafPath}"/></g>
    </g>
    <g transform="translate(20,9.5) rotate(90) scale(.65)" fill="${tip}"><path d="${leafPath}"/></g>
    <circle cx="20" cy="29.5" r="2" fill="${base}"/>
  </svg>`;
}

// Generic seal badge (own design, not a real ISO/FSSAI logo) — used on the fixed dark footer band.
function certBadge(top, bottom) {
  const svg = `<svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 2l4.4 2.5 5 .2 1.6 4.7 3.7 3.2-1.6 4.8 1.6 4.8-3.7 3.2-1.6 4.7-5 .2L20 34l-4.4 2.3-5-.2-1.6-4.7-3.7-3.2 1.6-4.8-1.6-4.8 3.7-3.2 1.6-4.7 5-.2z" stroke="#ffffff" stroke-width="1.3" fill="none"/>
    <circle cx="20" cy="18" r="9" fill="none" stroke="#ffffff" stroke-width="1.3"/>
    <path d="M15.5 18l3 3 6-6.5" stroke="#bcd9f5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return `<div class="cert-badge">${svg}<span>${escapeHtml(top)}<br><strong>${escapeHtml(bottom)}</strong></span></div>`;
}

function nav(active) {
  const links = NAV_ITEMS.map(
    (item) =>
      `<li><a href="${item.href}"${item.key === active ? ' class="active" aria-current="page"' : ''}>${item.label}</a></li>`
  ).join('');
  return `<header>
    <nav class="nav">
      <a href="/" class="brand">
        <img src="/images/mamta-bhoj-logo.png" alt="Mamta Bhoj — Devmam Flourish Foods LLP" class="brand-logo">
      </a>
      <ul class="nav-links" id="nav-links" hidden>${links}</ul>
      <div class="nav-actions">
        <a href="/contact" class="btn btn-primary btn-sm">Enquire Now</a>
        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </nav>
  </header>`;
}

function whyGrid(icons, heading, sub) {
  return `<section class="wrap" data-reveal><div class="section-head"><span class="eyebrow">Why Mamta Bhoj</span><h2>${escapeHtml(heading)}</h2>${sub ? `<p>${escapeHtml(sub)}</p>` : ''}</div>
    <div class="why-grid">
      <div class="why-card" data-reveal-item>${icons.trust.iso}<h4>Naturally Stone-Ground</h4><p>Chakki-milled to preserve fibre and nutrients.</p></div>
      <div class="why-card" data-reveal-item>${icons.trust.fssai}<h4>ISO &amp; FSSAI Compliant</h4><p>Milled and packed to ISO 9001:2015 and FSSAI standards.</p></div>
      <div class="why-card" data-reveal-item>${icons.trust.clock}<h4>Milled Fresh, Regularly</h4><p>Small, frequent milling batches.</p></div>
      <div class="why-card" data-reveal-item>${icons.trust.leaf}<h4>No Additives</h4><p>100% natural grain.</p></div>
    </div></section>`;
}

function promoStrip(icons) {
  return `<section class="wrap" data-reveal><div class="promo-strip">
    <a href="/quality" class="promo-card" data-reveal-item>${icons.trust.stone}<div><strong>100% Natural &amp; Stone-Ground</strong><span>No additives, no shortcuts — every batch is chakki-ground the traditional way.</span></div></a>
    <a href="/quality" class="promo-card" data-reveal-item>${icons.trust.iso}<div><strong>ISO 9001:2015 &amp; FSSAI Certified</strong><span>Milled and packed under certified quality and food-safety standards.</span></div></a>
    <a href="/contact" class="promo-card" data-reveal-item>${icons.trust.leaf}<div><strong>Dealership &amp; Bulk Enquiries</strong><span>Looking to stock Mamta Bhoj or place a bulk order? We would love to hear from you.</span></div></a>
  </div></section>`;
}

// Thin decorative wheat-ear strip used as a section divider — the
// recurring "wheat" visual thread running through the redesign.
function wheatDividerBand() {
  return `<div class="wheat-divider-band" aria-hidden="true">${wheatDivider()}</div>`;
}

function ctaBand(content) {
  const phoneHref = (content.phone || '').replace(/\s+/g, '');
  return `<section class="cta-band" data-reveal><div class="wheat-divider-band wheat-divider-band--top" aria-hidden="true">${wheatDivider('rgba(255,255,255,.55)')}</div><div class="wrap"><h2>For Dealership &amp; Bulk Enquiries</h2>
    <p>${escapeHtml(content.contact_intro)}</p>
    <div class="hero-cta" style="justify-content:center;"><a href="/contact" class="btn btn-primary">Get In Touch</a><a href="tel:${escapeHtml(phoneHref)}" class="btn btn-ghost">Call Us</a></div>
  </div></section>`;
}

// "From Wheat to Flour" — the six-step milling journey, built entirely from
// admin-editable content fields (process1..process6), reordered here so the
// two newer steps (quality check, ready-for-kitchen) slot into the right
// place in the story around the four original process fields.
function journeySection(content, options) {
  const opts = options || {};
  const steps = [
    { icon: journeyIcons.rawWheat, title: content.process1_title, body: content.process1_body },
    { icon: journeyIcons.cleaning, title: content.process2_title, body: content.process2_body },
    { icon: journeyIcons.milling, title: content.process3_title, body: content.process3_body },
    { icon: journeyIcons.qualityCheck, title: content.process5_title, body: content.process5_body },
    { icon: journeyIcons.packaging, title: content.process4_title, body: content.process4_body },
    { icon: journeyIcons.readyKitchen, title: content.process6_title, body: content.process6_body },
  ];
  return `<section class="journey-section wrap" data-reveal>
    <div class="section-head section-head--center">
      <span class="eyebrow">${opts.eyebrow ? escapeHtml(opts.eyebrow) : 'The Milling Journey'}</span>
      <h2>${opts.heading ? escapeHtml(opts.heading) : 'From Wheat to Flour'}</h2>
      <p>${opts.sub ? escapeHtml(opts.sub) : 'Every Mamta Bhoj pack follows the same careful journey, from raw grain to your kitchen shelf.'}</p>
    </div>
    <div class="journey-grid">
      ${steps
        .map(
          (s, i) => `<div class="journey-card" data-reveal-item style="--i:${i}">
            <div class="journey-card-visual">
              <span class="journey-num">${String(i + 1).padStart(2, '0')}</span>
              <div class="journey-icon">${s.icon}</div>
            </div>
            <div class="journey-card-body">
              <h4>${escapeHtml(s.title || '')}</h4>
              <p>${escapeHtml(s.body || '')}</p>
            </div>
          </div>`
        )
        .join('')}
    </div>
    ${opts.link ? `<div style="text-align:center;margin-top:32px;"><a href="/quality" class="know-more" style="margin:0 auto;">See Our Full Quality Process ${arrowIconSm()}</a></div>` : ''}
  </section>`;
}

function arrowIconSm() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function footer(content, products, nlStatus) {
  const year = new Date().getFullYear();
  const prodLinks = (products || [])
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((p) => `<li><a href="/products">${escapeHtml(p.name)}</a></li>`)
    .join('');
  let nlAlert = '';
  if (nlStatus === 'sent') nlAlert = `<p style="font-size:.78rem;color:#8fc1f0;margin-top:8px;">Thanks — you're subscribed!</p>`;
  else if (nlStatus === 'error') nlAlert = `<p style="font-size:.78rem;color:#ff8a80;margin-top:8px;">Please enter a valid email.</p>`;
  const phoneHref = (content.phone || '').replace(/\s+/g, '');
  return `<footer>
    <div class="wheat-divider-band wheat-divider-band--top" aria-hidden="true">${wheatDivider('rgba(193,146,44,.6)')}</div>
    <div class="wrap">
      <div class="footer-cols">
        <div class="footer-col">
          <div class="footer-brand">${logoMark(30, true)}<span class="brand-name">Mamta Bhoj</span></div>
          <p class="footer-meta">Devmam Flourish Foods LLP &middot; Fresh chakki atta, maida &amp; sooji, naturally stone-ground at our Chaubepur, Kanpur facility.</p>
          <form method="POST" action="/newsletter" class="footer-newsletter">
            <label for="nl-email">Get updates on new products &amp; offers</label>
            <div class="footer-newsletter-row">
              <input type="email" id="nl-email" name="email" placeholder="Your email address" required>
              <button type="submit" class="btn btn-primary btn-sm" data-loading-text="Subscribing…">Subscribe</button>
            </div>
            ${nlAlert}
          </form>
        </div>
        <div class="footer-col"><h4>Quick Links</h4><ul>
          <li><a href="/">Home</a></li><li><a href="/about">Our Story</a></li>
          <li><a href="/products">Products</a></li><li><a href="/quality">Quality &amp; Process</a></li>
          <li><a href="/faq">FAQs</a></li><li><a href="/contact">Contact</a></li>
        </ul></div>
        <div class="footer-col"><h4>Our Products</h4><ul>${prodLinks || '<li><a href="/products">All Products</a></li>'}</ul></div>
        <div class="footer-col"><h4>Get In Touch</h4>
          <p class="footer-meta">${escapeHtml(content.address || '')}</p>
          <p class="footer-meta" style="margin-top:8px;"><a href="tel:${escapeHtml(phoneHref)}" style="color:#fff;">${escapeHtml(content.phone || '')}</a><br>
          <a href="mailto:${escapeHtml(content.email || '')}" style="color:#9fb3cc;">${escapeHtml(content.email || '')}</a></p>
        </div>
      </div>
      <div class="footer-badges">${certBadge('Certified Facility', 'ISO 9001:2015')}${certBadge('Licence No. ' + (content.fssai || ''), 'FSSAI Licensed')}</div>
      <div class="footer-legal">
        <span>&copy; ${year} Devmam Flourish Foods LLP. All rights reserved.</span>
        <span>FSSAI Lic. No. ${escapeHtml(content.fssai || '')} &middot; ISO 9001:2015 Certified</span>
      </div>
    </div>
  </footer>`;
}

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

// Favicon built from the site's own wheat-seal mark (hardcoded brand colors,
// since a favicon renders with no page stylesheet to resolve CSS vars) — an
// inline SVG data URI, so no extra image asset or request is needed.
const FAVICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>
  <circle cx='20' cy='20' r='19' fill='%23071d3f'/>
  <circle cx='20' cy='20' r='14.5' fill='none' stroke='%23c1922c' stroke-width='1.4'/>
  <line x1='20' y1='29' x2='20' y2='11' stroke='%23ffffff' stroke-width='1.3' stroke-linecap='round'/>
  <g fill='%23c1922c'>
    <path d='M20 26 C 16.4 23.7 16.4 20.4 20 18 C 23.6 20.4 23.6 23.7 20 26 Z'/>
    <path d='M20 20.5 C 16.85 18.55 16.85 15.65 20 13.65 C 23.15 15.65 23.15 18.55 20 20.5 Z' opacity='.9'/>
    <path d='M20 15 C 17.3 13.35 17.3 10.95 20 9.35 C 22.7 10.95 22.7 13.35 20 15 Z' opacity='.8'/>
  </g>
  <circle cx='20' cy='29.5' r='2' fill='%23ffffff'/>
</svg>`;
const FAVICON_LINK = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${FAVICON_SVG.replace(/\s+/g, ' ').trim()}">`;

function callFab(content) {
  const phoneHref = ((content && content.phone) || '').replace(/\s+/g, '');
  if (!phoneHref) return '';
  return `<div class="call-fab"><a href="tel:${escapeHtml(phoneHref)}" aria-label="Call Mamta Bhoj"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.9a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.8 2.2z"/></svg></a></div>`;
}

function layout({ title, description, active, bodyHtml, content, products, nlStatus }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Mamta Bhoj</title>
<meta name="description" content="${escapeHtml(description || '')}">
${FAVICON_LINK}
${FONT_LINK}
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
${nav(active)}
<main id="top">
${bodyHtml}
</main>
${footer(content || {}, products || [], nlStatus)}
${callFab(content)}
<script src="/js/main.js"></script>
</body>
</html>`;
}

module.exports = { layout, nav, footer, logoMark, certBadge, whyGrid, promoStrip, ctaBand, wheatDividerBand, journeySection, escapeHtml, FONT_LINK, FAVICON_LINK };
