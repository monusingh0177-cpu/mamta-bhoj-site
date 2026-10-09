'use strict';
// Single authoritative business address (NAP). It matches the verified Google
// Business Profile and the premises named on the FSSAI licence. Public pages
// apply it over whatever address is stored in data/content.json, so the
// footer, contact page, FAQ, Organization schema and manufacturer page can
// never disagree, including on a host whose persisted content.json still
// holds an older value.
const BUSINESS_ADDRESS = 'Gata No. 402, Village Malau, Chaubepur, Tehsil Bilhaur, Kanpur Nagar, Uttar Pradesh – 209203';

// Owner-confirmed: every product is available in these pack sizes. Used for
// page text, titles/descriptions and schema so they can never disagree.
const PACK_SIZES = ['1 kg', '2 kg', '5 kg'];

// "1 kg, 2 kg and 5 kg"
function packSizesText() {
  return `${PACK_SIZES.slice(0, -1).join(', ')} and ${PACK_SIZES[PACK_SIZES.length - 1]}`;
}

// "1 kg, 2 kg & 5 kg" (compact form for titles)
function packSizesShort() {
  return `${PACK_SIZES.slice(0, -1).join(', ')} & ${PACK_SIZES[PACK_SIZES.length - 1]}`;
}

// Phrases that must not appear in public product copy because they are not
// backed by a verified source. The stored product text (data/products.json, and
// any copy persisted on a host) is not rewritten; it is cleaned at display time
// so the public site is right regardless of what the stored text says.
const UNSUPPORTED_PHRASES = [/\s*that stay fresh for longer/gi];

function cleanCopy(text) {
  return UNSUPPORTED_PHRASES.reduce((t, re) => t.replace(re, ''), String(text || ''));
}

function withCleanProductCopy(products) {
  return (products || []).map((p) => Object.assign({}, p, { description: cleanCopy(p.description) }));
}

function withBusinessAddress(content) {
  return Object.assign({}, content, { address: BUSINESS_ADDRESS });
}

// WhatsApp enquiry line (owner-provided). The visitor opens WhatsApp with this message pre-filled
// and presses Send themselves; nothing is sent from the site.
const WHATSAPP_NUMBER = '917905377971'; // international format, digits only (for wa.me)
const WHATSAPP_DISPLAY = '+91 79053 77971';
const WHATSAPP_MESSAGE = 'Hello Mamta Bhoj, I want to enquire about your products and bulk order options.';

function whatsappHref() {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
}

module.exports = { WHATSAPP_NUMBER, WHATSAPP_DISPLAY, WHATSAPP_MESSAGE, whatsappHref, BUSINESS_ADDRESS, PACK_SIZES, packSizesText, packSizesShort, withBusinessAddress, cleanCopy, withCleanProductCopy };
