'use strict';
// Business-claim validator for any text the autopilot (or an AI) wants to publish. It is deliberately
// conservative: an unsupported claim blocks the change; it is never "fixed" automatically.
const OWN_PLACES = ['kanpur', 'chaubepur', 'uttar pradesh', 'kanpur nagar', 'india'];
const OTHER_PLACES = ['delhi', 'new delhi', 'noida', 'gurgaon', 'gurugram', 'ghaziabad', 'faridabad', 'mumbai', 'pune', 'thane', 'navi mumbai', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad', 'surat', 'jaipur', 'lucknow', 'varanasi', 'allahabad', 'prayagraj', 'agra', 'meerut', 'patna', 'bhopal', 'indore', 'nagpur', 'chandigarh', 'ludhiana', 'amritsar', 'dehradun', 'ranchi', 'raipur', 'kochi', 'coimbatore', 'visakhapatnam', 'guwahati', 'maharashtra', 'gujarat', 'rajasthan', 'punjab', 'haryana', 'bihar', 'madhya pradesh', 'karnataka', 'tamil nadu', 'kerala', 'telangana', 'andhra pradesh', 'west bengal', 'odisha', 'assam', 'uttarakhand', 'jharkhand', 'chhattisgarh'];

const RULES = [
  ['price / currency', /(?:₹|\brs\.?\s?\d|\binr\b|\busd\b|\$\s?\d|\d\s?(?:rupees?|per kg|\/\s?kg)\b|\bprice list\b|\blowest price\b|\bbest price\b|\bcheapest\b|\baffordable price\b|\bdiscount)/i],
  ['minimum order quantity', /\b(?:moq|minimum order (?:quantity|of)|min\.? order)\b/i],
  ['private-label / OEM / contract manufacturing', /\b(?:private[- ]label|white[- ]label|oem|odm|contract (?:manufactur|packing)|own[- ]brand|custom(?:er)?[- ]brand|buyer'?s? brand|third[- ]party manufactur)/i],
  ['reviews / ratings / testimonials', /\b(?:\d(?:\.\d)?\s?(?:\/\s?5|stars?)|five[- ]star|rated|reviews?|ratings?|testimonials?|trusted by|loved by|our customers say|customer (?:logos?|stories))\b/i],
  ['delivery promise', /\b(?:same[- ]day|next[- ]day|24\s?(?:hours?|hrs?)|48\s?(?:hours?|hrs?)|free (?:delivery|shipping)|delivery within|delivered within|pan[- ]india delivery|door[- ]?step delivery|guaranteed delivery|on[- ]time delivery)\b/i],
  ['capacity / volume figure', /\b(?:production capacity|installed capacity|capacity of|\d[\d,.]*\s*(?:tons?|tonnes?|mt|quintals?|kg)\s*(?:per|\/|a)\s*(?:day|hour|month|year|shift))\b/i],
  ['certification not held', /\b(?:haccp|iso\s?22000|iso\s?14001|iso\s?45001|brc|ifs|fssc|gmp|halal|kosher|organic(?:\s+certified)?|apeda|nabl|bis certified|agmark|export[- ]certified|globalg\.?a\.?p)\b/i],
  ['ranking / superlative promise', /(?:(?:^|[^\w])#\s?1\b|\b(?:no\.?\s?1|number one|rank(?:s|ed|ing)? (?:first|top|#)|guaranteed (?:results|ranking|rankings|first)|best (?:in|flour|atta|maida|supplier)|top[- ]rated|market leader|largest|leading (?:manufacturer|supplier))\b)/i],
  ['near-me stuffing', /\bnear me\b/i],
  ['fake statistic', /\b\d{2,}\s?%\s?(?:of (?:customers|buyers|clients)|satisf|growth)|\b\d[\d,]*\+?\s?(?:happy|satisfied)\s?(?:customers|clients)\b/i],
];
const LAB = /\b(?:lab[- ]verified|laborator(?:y|ies)[- ]tested|lab[- ]tested|lab[- ]certified|clinically)\b/i;

// Returns a list of problems (empty = no unsupported claim found). `page` is the site path the text is for.
function checkClaims(text, page) {
  const t = String(text || '');
  const problems = [];
  for (const [label, re] of RULES) { const m = t.match(re); if (m) problems.push(`${label}: "${m[0]}"`); }
  const lab = t.match(LAB);
  if (lab && page !== '/products/fresh-chakki-atta') problems.push(`lab-verified claim outside the approved Chakki Atta page: "${lab[0]}"`);
  const low = t.toLowerCase();
  for (const place of OTHER_PLACES) if (new RegExp(`\\b${place}\\b`).test(low) && !OWN_PLACES.includes(place)) problems.push(`place outside the real factory location: "${place}"`);
  if (/\b(?:offices?|warehouses?|branches|depots?|showrooms?) (?:in|at)\b/i.test(t)) problems.push('office/warehouse location claim');
  return problems;
}

module.exports = { checkClaims, OTHER_PLACES };
