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

function withBusinessAddress(content) {
  return Object.assign({}, content, { address: BUSINESS_ADDRESS });
}

module.exports = { BUSINESS_ADDRESS, PACK_SIZES, packSizesText, packSizesShort, withBusinessAddress };
