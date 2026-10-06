'use strict';
// Single authoritative business address (NAP). It matches the verified Google
// Business Profile and the premises named on the FSSAI licence. Public pages
// apply it over whatever address is stored in data/content.json, so the
// footer, contact page, FAQ, Organization schema and manufacturer page can
// never disagree, including on a host whose persisted content.json still
// holds an older value.
const BUSINESS_ADDRESS = 'Gata No. 402, Village Malau, Chaubepur, Tehsil Bilhaur, Kanpur Nagar, Uttar Pradesh – 209203';

function withBusinessAddress(content) {
  return Object.assign({}, content, { address: BUSINESS_ADDRESS });
}

module.exports = { BUSINESS_ADDRESS, withBusinessAddress };
