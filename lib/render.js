'use strict';
const { escapeHtml, slugify } = require('./http-utils');
const { wheatDivider, journeyIcons } = require('./icons');
const { assetUrl } = require('./asset-version');
const seo = require('./seo');

const NAV_ITEMS = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/about', label: 'Our Story', key: 'about' },
  { href: '/products', label: 'Products', key: 'products' },
  { href: '/quality', label: 'Quality &amp; Process', key: 'quality' },
  { href: '/faq', label: 'FAQs', key: 'faq' },
  { href: '/contact', label: 'Contact', key: 'contact' },
];

// Approved Mamta Bhoj premium shield logo (transparent PNG, 320x230 — 3x its largest 105px display width — cut out
// from reference/mamta-bhoj-premium-logo-source.png). Used for the header,
// footer and admin brand; size is set per placement in CSS.
const LOGO_SRC = '/images/mamta-bhoj-premium-logo.png';
// Decorative copy of the logo for places where the visible "Mamta Bhoj"
// text right next to it already names the brand (footer, admin) — empty alt
// so screen readers don't announce the name twice.
function brandLogoImg(className) {
  return `<img src="${LOGO_SRC}" alt="" class="${className}" width="320" height="230" loading="lazy" decoding="async">`;
}

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

// Generic seal badge (own design, not a real ISO/FSSAI logo) — used on the light footer band;
// strokes follow the theme via currentColor (set on .cert-badge svg) and the saffron token.
function certBadge(top, bottom) {
  const svg = `<svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 2l4.4 2.5 5 .2 1.6 4.7 3.7 3.2-1.6 4.8 1.6 4.8-3.7 3.2-1.6 4.7-5 .2L20 34l-4.4 2.3-5-.2-1.6-4.7-3.7-3.2 1.6-4.8-1.6-4.8 3.7-3.2 1.6-4.7 5-.2z" stroke="currentColor" stroke-width="1.3" fill="none"/>
    <circle cx="20" cy="18" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
    <path d="M15.5 18l3 3 6-6.5" stroke="var(--saffron)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
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
        <img src="${LOGO_SRC}" alt="Mamta Bhoj — Devmam Flourish Foods LLP" class="brand-logo" width="320" height="230">
      </a>
      <ul class="nav-links" id="nav-links" hidden>${links}</ul>
      <div class="nav-actions">
        <a href="/contact" class="btn btn-primary btn-sm">Enquire Now <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
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
    <a href="/certifications" class="promo-card" data-reveal-item>${icons.trust.iso}<div><strong>ISO 9001:2015 &amp; FSSAI Certified</strong><span>Milled and packed under certified quality and food-safety standards.</span></div></a>
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
    .map((p) => `<li><a href="/products/${slugify(p.name)}">${escapeHtml(p.name)}</a></li>`)
    .join('');
  let nlAlert = '';
  if (nlStatus === 'sent') nlAlert = `<p class="footer-nl-msg footer-nl-msg--ok">Thanks — you're subscribed!</p>`;
  else if (nlStatus === 'error') nlAlert = `<p class="footer-nl-msg footer-nl-msg--err">Please enter a valid email.</p>`;
  const phoneHref = (content.phone || '').replace(/\s+/g, '');
  return `<footer>
    <div class="wheat-divider-band wheat-divider-band--top" aria-hidden="true">${wheatDivider('rgba(193,146,44,.6)')}</div>
    <div class="wrap">
      <div class="footer-cols">
        <div class="footer-col">
          <div class="footer-brand">${brandLogoImg('footer-logo')}<span class="brand-name">Mamta Bhoj</span></div>
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
          <li><a href="/certifications">Certifications</a></li>
        </ul></div>
        <div class="footer-col"><h4>Our Products</h4><ul>${prodLinks || '<li><a href="/products">All Products</a></li>'}</ul></div>
        <div class="footer-col"><h4>Get In Touch</h4>
          <p class="footer-meta">${escapeHtml(content.address || '')}</p>
          <p class="footer-meta" style="margin-top:8px;"><a href="tel:${escapeHtml(phoneHref)}" class="footer-phone">${escapeHtml(content.phone || '')}</a><br>
          <a href="mailto:${escapeHtml(content.email || '')}" class="footer-email">${escapeHtml(content.email || '')}</a></p>
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
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Caveat:wght@600&display=swap" rel="stylesheet">`;

// Favicon: a 64x64 transparent PNG rendered from the approved premium logo
// (public/images/mamta-bhoj-favicon.png).
const FAVICON_LINK = `<link rel="icon" type="image/png" sizes="64x64" href="/images/mamta-bhoj-favicon.png">`;

function callFab(content) {
  const phoneHref = ((content && content.phone) || '').replace(/\s+/g, '');
  if (!phoneHref) return '';
  return `<div class="call-fab"><a href="tel:${escapeHtml(phoneHref)}" aria-label="Call Mamta Bhoj"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.9a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.8 2.2z"/></svg></a></div>`;
}

function layout({ title, description, active, bodyHtml, content, products, nlStatus, canonicalPath, ogImage, ogImageAlt, jsonLd, noindex }) {
  const desc = escapeHtml(description || '');
  const pageTitle = escapeHtml(title);
  const canonical = canonicalPath ? seo.absoluteUrl(canonicalPath) : '';
  const img = ogImage || { path: seo.DEFAULT_OG_IMAGE.path, width: seo.DEFAULT_OG_IMAGE.width, height: seo.DEFAULT_OG_IMAGE.height };
  const imgAlt = ogImageAlt || 'Representative Mamta Bhoj facility visual showing a modern flour processing environment';
  const social = canonical
    ? `<meta property="og:site_name" content="${seo.BRAND_NAME}">
<meta property="og:locale" content="en_IN">
<meta property="og:type" content="website">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(seo.absoluteUrl(img.path))}">${img.width && img.height ? `
<meta property="og:image:width" content="${img.width}">
<meta property="og:image:height" content="${img.height}">` : ''}
<meta property="og:image:alt" content="${escapeHtml(imgAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${pageTitle}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${escapeHtml(seo.absoluteUrl(img.path))}">
<meta name="twitter:image:alt" content="${escapeHtml(imgAlt)}">
`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${desc}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">\n` : ''}${social}${FAVICON_LINK}
${FONT_LINK}
<link rel="stylesheet" href="${assetUrl('/css/style.css')}">
${jsonLd ? seo.jsonLdScript(jsonLd) + '\n' : ''}</head>
<body>
${nav(active)}
<main id="top">
${bodyHtml}
</main>
${footer(content || {}, products || [], nlStatus)}
${callFab(content)}
<script src="${assetUrl('/js/main.js')}"></script>
</body>
</html>`;
}

module.exports = { layout, nav, footer, logoMark, brandLogoImg, certBadge, whyGrid, promoStrip, ctaBand, wheatDividerBand, journeySection, escapeHtml, FONT_LINK, FAVICON_LINK };
