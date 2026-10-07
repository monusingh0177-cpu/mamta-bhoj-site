'use strict';
const { packSizesText } = require('../lib/business');
const { GUIDELINK } = require('./links');

// Phase-2 additions for the five product pages: what the product is, who it
// suits, product-specific FAQs, and the B2B / guide links for each product.
// Facts used are already on the site (product pages, FAQ, Quality page) or
// confirmed by the owner (pack sizes, Chakki Atta fibre/protein claim).
// NOT stated: nutrition numbers, shelf life, technical milling specs, prices,
// MOQ, delivery, certifications beyond ISO 9001:2015 / FSSAI, and no
// "protein" wording outside Fresh Chakki Atta. For Fresh Chakki Atta only, the owner
// has confirmed the High Protein claim and that the fibre-and-protein claim is lab
// verified; it is stated as a claim, with no certificate, lab name or figures.
// Each FAQ answer is plain text
// so the FAQPage schema can match the visible answer exactly.

const PACKS = packSizesText();
const packsFaq = (name) => ['Which pack sizes are available?', `${name} is sold in ${PACKS} packs.`];

const PRODUCT_EXTRA = {
  'fresh-chakki-atta': {
    whatIs: {
      h2: 'What is chakki atta?',
      paras: [
        `Chakki atta is whole wheat flour ground on a stone chakki, the traditional method behind home-style atta. Mamta Bhoj Fresh Chakki Atta is 100% whole wheat and naturally stone-ground at our unit in Kanpur, made for everyday rotis, chapatis and parathas.`,
        `Curious how stone-ground flour differs from roller-milled flour? Our guide to ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki atta vs roller-milled atta')} explains both methods.`,
      ],
    },
    customers: [
      'Households that make rotis, chapatis and parathas every day',
      'Canteens, hostels and caterers that serve home-style breads',
      'Retailers who want a staple whole wheat atta on the shelf',
    ],
    faqs: [
      ['Is Mamta Bhoj Fresh Chakki Atta whole wheat?', 'Yes. It is 100% whole wheat and naturally stone-ground.'],
      [
        'Is Fresh Chakki Atta high in protein and fibre?',
        'Mamta Bhoj Fresh Chakki Atta is a high-protein whole wheat atta that is rich in fibre, and the fibre and protein claim is lab verified. The nutrition information printed on the pack gives the exact values.',
      ],
      [
        'What can I make with it?',
        'It is made for everyday rotis, chapatis and parathas. For tandoor-style breads, our Tandoori Atta, a coarser grind, may suit better.',
      ],
      packsFaq('Mamta Bhoj Fresh Chakki Atta'),
      ['How should I store it?', 'Keep the pack sealed after opening and store it in a cool, dry place away from direct sunlight and moisture.'],
      [
        'Can I buy it in bulk for a business?',
        'Yes. Send a bulk or wholesale enquiry through the Contact page. Pricing and quantities are discussed directly with our team.',
      ],
    ],
    glance: [
      ['Made from', '100% whole wheat'],
      ['Milling', 'Naturally stone-ground (chakki)'],
      ['Best for', 'Rotis, chapatis and parathas'],
    ],
    b2b: [
      ['flour-manufacturer-india#atta', 'our atta manufacturer overview'],
      ['bulk-flour-supplier-india', 'buying atta in bulk'],
      ['wholesale-flour-supplier', 'wholesale supply for dealers and retailers'],
    ],
    enquiry: { type: 'Wholesale / Bulk Purchase', label: 'send a bulk or wholesale enquiry' },
    guides: ['how-to-choose-atta', 'chakki-atta-vs-roller-milled-atta', 'how-to-store-flour', 'maida-vs-atta'],
  },

  'tandoori-atta': {
    whatIs: {
      h2: 'What is tandoori atta?',
      paras: [
        `Tandoori atta is wheat flour milled coarser than everyday chakki atta, made with tandoor-style rotis and thicker parathas in mind. Mamta Bhoj Tandoori Atta is a coarser stone-ground wheat flour that follows the same natural, additive-free milling approach as our Chakki Atta.`,
        `How it differs from regular atta is explained in our ${GUIDELINK('tandoori-atta-guide', 'tandoori atta guide')}, and the wider comparison of milling methods is in ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki atta vs roller-milled atta')}.`,
      ],
    },
    customers: [
      'Restaurants and dhabas that cook breads in a tandoor',
      'Caterers preparing tandoori rotis and parathas in volume',
      'Home cooks who prefer thicker, tandoor-style breads',
    ],
    faqs: [
      [
        'How is tandoori atta different from chakki atta?',
        'Tandoori atta is milled coarser. Both are stone-ground wheat flours from our Kanpur unit, and the coarser grind is intended for tandoor-style breads.',
      ],
      [
        'Can I use it for everyday rotis?',
        'It is made for tandoori rotis and thicker parathas. For thin everyday rotis on a tawa, Fresh Chakki Atta is the usual choice.',
      ],
      ['Is it suitable for restaurant kitchens?', 'It is positioned for home and food-service kitchens that prepare breads in a tandoor.'],
      packsFaq('Mamta Bhoj Tandoori Atta'),
      [
        'Can restaurants and caterers enquire about regular supply?',
        'Yes. Use the Contact page and choose Institutional / HoReCa as the enquiry type. Quantities, pricing and delivery are discussed directly.',
      ],
    ],
    glance: [
      ['Made from', 'Wheat'],
      ['Milling', 'Coarser stone-ground grind'],
      ['Best for', 'Tandoori rotis and thicker parathas'],
    ],
    b2b: [
      ['institutional-flour-supplier', 'institutional supply for restaurants and caterers'],
      ['flour-manufacturer-india#atta', 'tandoori atta manufacturer details'],
      ['bulk-flour-supplier-india', 'bulk supply for tandoor kitchens'],
    ],
    enquiry: { type: 'Institutional / HoReCa', label: 'send an enquiry for your kitchen' },
    guides: ['tandoori-atta-guide', 'how-to-choose-atta', 'chakki-atta-vs-roller-milled-atta'],
  },

  maida: {
    whatIs: {
      h2: 'What is maida?',
      paras: [
        `Maida is refined wheat flour: only the starchy inner part of the grain is milled and sifted fine, which gives a soft, pale flour and a smooth, elastic dough. Mamta Bhoj Maida is a finely refined wheat flour made for naan and other leavened breads, biscuits and everyday Indian cooking.`,
        `Our guide on ${GUIDELINK('what-is-maida', 'what maida is')} covers how it is made and where it is used, and ${GUIDELINK('maida-vs-atta', 'maida vs atta')} compares it with whole wheat flour.`,
      ],
    },
    customers: [
      'Bakeries and sweet shops that make bread, biscuits and cakes',
      'Restaurants preparing naan and kulcha',
      'Snack makers rolling samosa and kachori pastry',
      'Home bakers and everyday cooks',
    ],
    faqs: [
      [
        'What is maida used for?',
        'Maida is used for naan and other leavened breads, biscuits, cakes, pastry and many fried snacks, as well as for thickening sauces and in batters.',
      ],
      [
        'Is maida the same as atta?',
        'No. Atta is made from the whole wheat grain, while maida is refined flour made from the inner part of the grain only. Our maida vs atta guide explains the difference.',
      ],
      ['Can I make rotis with maida?', 'You can, but the taste and texture differ from rotis made with atta.'],
      packsFaq('Mamta Bhoj Maida'),
      [
        'How should I store maida?',
        'Keep the pack sealed, dry and cool, away from direct sunlight, moisture and strong-smelling items, and follow the best-before date on the pack.',
      ],
      [
        'Can a bakery enquire about regular supply?',
        'Yes. Send a bulk or institutional enquiry through the Contact page, and our team will discuss prices, quantities and delivery with you directly.',
      ],
    ],
    glance: [
      ['Made from', 'Wheat, finely refined'],
      ['Milling', 'Refined and sifted fine'],
      ['Best for', 'Naan and other leavened breads, biscuits, bakery items'],
    ],
    b2b: [
      ['institutional-flour-supplier', 'institutional supply for bakeries and kitchens'],
      ['flour-manufacturer-india#maida', 'maida manufacturer details'],
      ['bulk-flour-supplier-india', 'bulk maida supply'],
    ],
    enquiry: { type: 'Institutional / HoReCa', label: 'send an enquiry for your bakery or kitchen' },
    guides: ['what-is-maida', 'maida-vs-atta', 'types-of-flour-in-india', 'how-to-choose-flour-supplier'],
  },

  'sooji-rava': {
    whatIs: {
      h2: 'What is sooji (rava)?',
      paras: [
        `Sooji and rava are two names for semolina: wheat milled into small, even granules rather than a fine powder. Mamta Bhoj Sooji / Rava is evenly milled semolina with a consistent grain size, made for upma, halwa, dosa batter and other traditional preparations.`,
        `The ${GUIDELINK('sooji-vs-rava', 'sooji vs rava guide')} explains why the two names exist and why grain size matters.`,
      ],
    },
    customers: [
      'Breakfast and tiffin kitchens making upma, idli and dosa',
      'Sweet makers cooking halwa and kesari',
      'Snack makers and caterers',
      'Households that keep semolina as a pantry staple',
    ],
    faqs: [
      ['Are sooji and rava the same thing?', 'Yes. Both names refer to semolina, used in different regions of India.'],
      ['What can I make with Mamta Bhoj Sooji / Rava?', 'Upma, halwa, dosa batter, snacks and other traditional preparations that call for semolina.'],
      [
        'Why does grain size matter?',
        'An even grain size helps semolina cook at a steady rate, so the finished dish has a uniform texture. Mamta Bhoj Sooji / Rava is evenly milled with a consistent grain size.',
      ],
      packsFaq('Mamta Bhoj Sooji / Rava'),
      [
        'How should I store sooji?',
        'Keep the pack tightly closed in a cool, dry place away from direct sunlight and moisture, and refer to the batch details on the label.',
      ],
      [
        'Can a kitchen or shop buy it regularly?',
        'Yes. Send a wholesale or institutional enquiry through the Contact page; terms, including prices, quantities and delivery, are agreed directly with our team.',
      ],
    ],
    glance: [
      ['Made from', 'Wheat, as semolina'],
      ['Milling', 'Evenly milled to a consistent grain size'],
      ['Best for', 'Upma, halwa, dosa batter and snacks'],
    ],
    b2b: [
      ['wholesale-flour-supplier', 'wholesale supply for shops and dealers'],
      ['flour-manufacturer-india#sooji', 'sooji and rava manufacturer details'],
      ['institutional-flour-supplier', 'institutional supply for kitchens'],
    ],
    enquiry: { type: 'Wholesale / Bulk Purchase', label: 'send a wholesale or kitchen enquiry' },
    guides: ['sooji-vs-rava', 'types-of-flour-in-india', 'how-flour-is-made'],
  },

  besan: {
    whatIs: {
      h2: 'What is besan?',
      paras: [
        `Besan, or gram flour, is a flour milled from chana dal rather than from wheat. Mamta Bhoj Besan is finely milled from cleaned chana dal and is made for pakoras, chilla, kadhi and Indian sweets.`,
        `Our guide to ${GUIDELINK('what-is-besan', 'what besan is')} covers how it is made, how it differs from chickpea flour and how to get a lump-free batter.`,
      ],
    },
    customers: [
      'Sweet shops making besan ladoo and barfi',
      'Namkeen and snack makers',
      'Caterers preparing pakoras and kadhi',
      'Households that cook chilla, pakoras and kadhi',
    ],
    faqs: [
      ['Is besan made from wheat?', 'No. Besan is milled from chana dal, which is a pulse.'],
      ['What can I cook with it?', 'Pakoras, chilla, kadhi and a range of snacks and Indian sweets.'],
      ['How do I avoid lumps?', 'Sift the besan, add the liquid a little at a time and whisk steadily until the batter is smooth.'],
      packsFaq('Mamta Bhoj Besan'),
      ['How should I store besan?', 'Keep it sealed in a cool, dry place away from moisture, and use a clean, dry spoon.'],
      [
        'Can sweet shops and snack makers buy in quantity?',
        'Yes. Send a wholesale or bulk enquiry through the Contact page. Prices, quantities and delivery depend on your requirement and are discussed directly.',
      ],
    ],
    glance: [
      ['Made from', 'Cleaned chana dal (not wheat)'],
      ['Milling', 'Finely milled'],
      ['Best for', 'Pakoras, chilla, kadhi, snacks and sweets'],
    ],
    b2b: [
      ['wholesale-flour-supplier', 'wholesale supply for sweet shops and retailers'],
      ['flour-manufacturer-india#besan', 'besan manufacturer details'],
      ['bulk-flour-supplier-india', 'bulk besan supply'],
    ],
    enquiry: { type: 'Wholesale / Bulk Purchase', label: 'send a wholesale or bulk enquiry' },
    guides: ['what-is-besan', 'how-to-store-flour', 'types-of-flour-in-india', 'how-to-choose-flour-supplier'],
  },
};

module.exports = { PRODUCT_EXTRA };
