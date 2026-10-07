'use strict';
const { escapeHtml, slugify } = require('../lib/http-utils');
const seo = require('../lib/seo');
const { packSizesText, BUSINESS_ADDRESS } = require('../lib/business');
const { ctaBand, wheatDividerBand } = require('../lib/render');
const { findGuide } = require('./guides');
const { B2B_LINKS, b2bAnchor, enquiryHref, LINK, B2BLINK, PRODLINK, GUIDELINK, MFRLINK, CONTACTLINK } = require('./links');

// The five B2B pages. Each has a different job so they do not read as
// one page repeated with different keywords:
//   flour-manufacturer-india       - product-by-product manufacturer overview and how
//                                    to evaluate a manufacturer (hub for the pages below)
//   bulk-flour-supplier-india      - businesses that buy flour in volume
//   wholesale-flour-supplier       - dealers, traders and retailers who resell
//   institutional-flour-supplier   - commercial kitchens, caterers and bakeries
//   supply-distribution-india      - enquiries from other states (positioning only)
//
// Facts used: the Mamta Bhoj range and pack sizes (1/2/5 kg), the Kanpur unit,
// ISO 9001:2015 + the FSSAI licence number (from site content), and the
// published "responds within one business day" line. Deliberately NOT stated:
// prices, MOQ, delivery areas or timelines, samples, capacity, territories,
// any office or warehouse outside Kanpur, or an existing national network.
// Body strings are trusted hand-written HTML; "%FSSAI%" is replaced at render.

const PACKS = packSizesText();

const B2B_PAGES = [
  // ------------------------------------------------------------------
  {
    slug: 'flour-manufacturer-india',
    title: 'Flour Manufacturer in India | Mamta Bhoj Atta, Maida, Besan',
    h1: 'Flour Manufacturer in India: Atta, Maida, Sooji and Besan from Kanpur',
    crumb: 'Flour Manufacturer in India',
    description:
      'Mamta Bhoj atta, tandoori atta, maida, sooji and besan, milled by Devmam Flourish Foods LLP in Kanpur. A product-by-product overview for buyers across India.',
    eyebrow: 'Flour Manufacturer',
    intro:
      'Mamta Bhoj is the brand of Devmam Flourish Foods LLP, which mills and packs its flour at its own unit in Kanpur, Uttar Pradesh. This page is for buyers anywhere in India who want to know what we make, what each flour is for and what to check before choosing a manufacturer.',
    enquiryType: 'Wholesale / Bulk Purchase',
    ctaLabel: 'Send a Manufacturer Enquiry',
    sections: [
      {
        h2: 'A flour manufacturer based in Kanpur, Uttar Pradesh',
        body: [
          `Devmam Flourish Foods LLP mills and packs the Mamta Bhoj range at its own unit in Chaubepur, Kanpur Nagar. The range has five flours: Fresh Chakki Atta, Tandoori Atta, Maida, Sooji / Rava and Besan. Each one comes in ${PACKS} packs.`,
          `Businesses from any part of India are welcome to enquire: dealers, distributors, wholesalers, bakeries, caterers, sweet shops and kitchens. Whether and how we can supply a particular city or state is confirmed during the enquiry, because delivery depends on the location and the requirement. This page does not promise supply to any specific place.`,
          `The mill itself, its address and its certifications are described on our ${MFRLINK('flour manufacturer in Kanpur page')}.`,
        ],
      },
      {
        h2: 'The Mamta Bhoj range at a glance',
        body: [`What each flour is made from and what it is typically used for. Every product is available in ${PACKS} packs.`],
        table: {
          head: ['Product', 'Made from', 'Typically used for', 'Pack sizes'],
          rows: [
            ['Fresh Chakki Atta', 'Whole wheat, naturally stone-ground', 'Rotis, chapatis and parathas', PACKS],
            ['Tandoori Atta', 'Wheat, coarser stone-ground', 'Tandoori rotis and thicker parathas', PACKS],
            ['Maida', 'Wheat, finely refined', 'Naan and other leavened breads, biscuits, bakery items', PACKS],
            ['Sooji / Rava', 'Wheat, evenly milled semolina', 'Upma, halwa, dosa batter, snacks', PACKS],
            ['Besan', 'Cleaned chana dal, finely milled', 'Pakoras, chilla, kadhi, sweets and snacks', PACKS],
          ],
        },
        after: [
          `Each flour has its own page: ${PRODLINK('fresh-chakki-atta', 'Fresh Chakki Atta')}, ${PRODLINK('tandoori-atta', 'Tandoori Atta')}, ${PRODLINK('maida', 'Maida')}, ${PRODLINK('sooji-rava', 'Sooji / Rava')} and ${PRODLINK('besan', 'Besan')}. If you are still deciding between flours, our guide to the ${GUIDELINK('types-of-flour-in-india', 'types of flour in India')} compares them.`,
        ],
      },
      {
        id: 'atta',
        h2: 'Atta manufacturer: Chakki Atta and Tandoori Atta',
        body: [
          `Our atta is made from wheat and naturally stone-ground in the traditional chakki way. ${PRODLINK('fresh-chakki-atta', 'Mamta Bhoj Fresh Chakki Atta')} is 100% whole wheat, made for everyday rotis, chapatis and parathas, and suits households, canteens, hostels and retailers who stock a staple atta. It is rich in fibre and protein, a claim that is lab verified; the nutrition information printed on the pack gives the exact values.`,
          `${PRODLINK('tandoori-atta', 'Mamta Bhoj Tandoori Atta')} is milled coarser, for kitchens that bake tandoori-style rotis and thicker parathas.`,
        ],
        subs: [
          {
            h3: 'What to tell us about your atta requirement',
            list: [
              'Whether the atta is for rotis on a tawa or for a tandoor',
              'Your approximate monthly requirement, so we can talk about the right pack sizes',
              'Whether you buy for your own kitchen or for resale',
              'Your city and state',
            ],
          },
        ],
        after: [`For background, read ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'how chakki atta differs from roller-milled atta')}, the ${GUIDELINK('tandoori-atta-guide', 'tandoori atta guide')} and ${GUIDELINK('how-to-choose-atta', 'what to check when choosing atta')}.`],
      },
      {
        id: 'maida',
        h2: 'Maida manufacturer',
        body: [
          `${PRODLINK('maida', 'Mamta Bhoj Maida')} is a finely refined wheat flour. It suits bakeries and biscuit makers, kitchens that make naan and kulcha, and snack and sweet makers who roll pastry. Which flour is right depends on the product you make, so describe the dish or item rather than only the quantity.`,
          `We do not publish technical specifications for maida on this website. If your process depends on a particular property of the flour, say so in your enquiry.`,
        ],
        after: [`New to the difference between the flours? See ${GUIDELINK('what-is-maida', 'what maida is')} and ${GUIDELINK('maida-vs-atta', 'how maida differs from atta')}.`],
      },
      {
        id: 'sooji',
        h2: 'Sooji (rava) manufacturer',
        body: [
          `${PRODLINK('sooji-rava', 'Mamta Bhoj Sooji / Rava')} is semolina milled to a consistent grain size, used for upma, halwa, dosa batter and snacks. It suits breakfast and tiffin kitchens, sweet makers and caterers.`,
          `If your recipe needs a particular grain size, describe it in your enquiry. Our guide to ${GUIDELINK('sooji-vs-rava', 'sooji and rava')} explains why the two names exist and why grain size matters.`,
        ],
      },
      {
        id: 'besan',
        h2: 'Besan manufacturer',
        body: [
          `${PRODLINK('besan', 'Mamta Bhoj Besan')} is gram flour finely milled from cleaned chana dal. It suits sweet shops, namkeen and snack makers, caterers and households making pakoras, chilla, kadhi, ladoo and other traditional preparations.`,
          `Besan comes from chana dal, not wheat, which is worth knowing if you are planning storage or labelling. Our guide to ${GUIDELINK('what-is-besan', 'what besan is')} covers how it is made and used.`,
        ],
      },
      {
        h2: 'How to evaluate a flour manufacturer',
        body: [`Whoever you buy from, these are the points worth checking before you place a regular order.`],
        list: [
          'Is it a mill or a trader? Ask where the flour is milled and packed. Ours is milled and packed at our own unit in Chaubepur, Kanpur.',
          'FSSAI licence: the licence number should be on the pack. Ours is %FSSAI%, and the licence document is on our certifications page.',
          'Certification scope: ask which products an ISO certificate covers. Ours covers the manufacturing, processing and packing of food products including atta, maida and besan.',
          'Labels: batch and packing details and a best-before date should be printed on every pack.',
          'Consistency: ask how the supplier handles repeat orders, and start with a trial before committing to volume.',
          'Terms: prices, minimum quantities and delivery should be agreed in writing before the first order.',
        ],
        after: [
          `Our ${GUIDELINK('how-to-choose-flour-supplier', 'checklist for choosing a flour supplier')} goes deeper, and the ${GUIDELINK('bulk-flour-procurement-guide', 'bulk flour procurement guide')} covers planning the order itself. You can check the licence and certificate on the ${LINK('/certifications', 'certifications page')}.`,
        ],
      },
      {
        h2: 'Ways to buy from us',
        body: [
          `Pick the page closest to your business: ${B2BLINK('bulk-flour-supplier-india', 'bulk flour supply')} for volume users, ${B2BLINK('wholesale-flour-supplier', 'wholesale supply for dealers and retailers')}, ${B2BLINK('institutional-flour-supplier', 'institutional supply for kitchens and bakeries')}, or ${B2BLINK('supply-distribution-india', 'supply and distribution enquiries from other states')} if you are a dealer or distributor outside Uttar Pradesh.`,
          `${CONTACTLINK('Send an enquiry', 'Wholesale / Bulk Purchase')} with the products you need, your approximate monthly requirement and your city and state. Our team responds within one business day. Pricing, minimum quantities and delivery depend on the product and your requirement, so we discuss them directly.`,
        ],
      },
    ],
    faqs: [
      [
        'Are you a manufacturer or a trader?',
        'Mamta Bhoj flours are milled and packed by Devmam Flourish Foods LLP at its own unit in Chaubepur, Kanpur Nagar, Uttar Pradesh.',
      ],
      ['Which flours do you manufacture?', `Fresh Chakki Atta, Tandoori Atta, Maida, Sooji / Rava and Besan. Each is available in ${PACKS} packs.`],
      [
        'Do you supply across India?',
        'We welcome enquiries from businesses in every part of India. Whether and how we can supply a particular location is confirmed during the enquiry, because delivery depends on the location and the requirement.',
      ],
      [
        'Are prices and minimum order quantities listed here?',
        'No. Pricing, minimum quantities and delivery depend on the product, pack size, quantity and location, so we discuss them directly after an enquiry.',
      ],
      [
        'Is the Chakki Atta fibre and protein claim verified?',
        'Yes. The fibre and protein claim for Mamta Bhoj Fresh Chakki Atta is lab verified. The nutrition information printed on the pack gives the exact values.',
      ],
      [
        'How do I start an enquiry?',
        'Use the enquiry form on the Contact page and choose the enquiry type closest to your business. Add the products you need, your approximate monthly requirement and your city and state. Our team responds within one business day.',
      ],
    ],
    guides: ['how-to-choose-flour-supplier', 'bulk-flour-procurement-guide', 'types-of-flour-in-india', 'chakki-atta-vs-roller-milled-atta'],
  },
  // ------------------------------------------------------------------
  {
    slug: 'bulk-flour-supplier-india',
    title: 'Bulk Flour Supplier in India | Mamta Bhoj Flour Mill, Kanpur',
    h1: 'Bulk Flour Supplier in India: Atta, Maida, Sooji and Besan',
    description:
      'Bulk flour enquiries for Mamta Bhoj atta, maida, sooji and besan, milled by Devmam Flourish Foods LLP in Kanpur. Tell us your requirement and city.',
    eyebrow: 'Bulk Supply',
    intro:
      'Devmam Flourish Foods LLP mills the Mamta Bhoj range at its own unit in Kanpur, Uttar Pradesh. If your business uses flour in volume, tell us what you need and we will discuss it with you directly. We welcome bulk enquiries from businesses in any part of India; supply for each location is confirmed case by case.',
    enquiryType: 'Wholesale / Bulk Purchase',
    ctaLabel: 'Send a Bulk Enquiry',
    productsAfter: 1,
    productsHeading: 'The range available for bulk enquiries',
    productsIntro: `All five products come in ${PACKS} packs.`,
    products: [
      ['fresh-chakki-atta', 'Whole wheat atta for kitchens and canteens that make rotis, chapatis and parathas in quantity, and for retailers who stock a staple atta.'],
      ['tandoori-atta', 'Coarser stone-ground atta for kitchens that bake breads in a tandoor, from restaurants to caterers.'],
      ['maida', 'Refined wheat flour for bakeries, naan and kulcha kitchens, and biscuit and pastry makers.'],
      ['sooji-rava', 'Evenly milled semolina for breakfast kitchens, halwa and sweet makers, and snack businesses.'],
      ['besan', 'Gram flour from cleaned chana dal for pakora and namkeen makers, sweet shops and caterers.'],
    ],
    sections: [
      {
        h2: 'Who our bulk enquiries are for',
        body: [
          `Bulk enquiries usually come from businesses where flour is a daily raw material rather than an occasional purchase.`,
        ],
        list: [
          'Bakeries and biscuit makers that use maida every day',
          'Sweet shops and namkeen makers that buy besan, sooji and maida in quantity',
          'Caterers and restaurants running high-volume kitchens',
          'Food processors and snack makers',
          'Retailers and traders buying for resale at larger volumes',
        ],
        after: [
          `If you are not sure whether your requirement counts as bulk, simply describe it. We do not publish a fixed minimum on this website, so the conversation starts with what you need.`,
        ],
      },
      {
        h2: 'Planning a bulk order',
        subs: [
          {
            h3: 'Match the flour to the job',
            body: [
              `Name the dish or product you are making. A tandoori roti, a naan, a biscuit and a halwa each ask for a different flour, and the right match matters more than the rate per kilogram. Our guides on ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki atta and roller-milled atta')} and ${GUIDELINK('what-is-maida', 'what maida is')} can help you decide.`,
            ],
          },
          {
            h3: 'Choose pack sizes you can handle',
            body: [
              `Mamta Bhoj is packed in ${PACKS}. Think about how quickly you use flour, how much storage you have and how your team handles stock. If you need a different format, mention it in your enquiry.`,
            ],
          },
          {
            h3: 'Think about consistency',
            body: [
              `For a recurring requirement, consistency from one delivery to the next matters as much as the first sample. Tell us how often you expect to order so we can discuss it.`,
            ],
          },
          {
            h3: 'Plan storage at your end',
            body: [`Keep stock sealed, dry and cool, away from direct sunlight and moisture, and use older stock first.`],
          },
          {
            h3: 'Delivery',
            body: [
              `Delivery arrangements depend on your location and requirement, so they are discussed for each enquiry. We do not publish delivery timelines on this website.`,
            ],
          },
        ],
      },
      {
        h2: 'What to include in a bulk enquiry',
        body: [`The enquiry form has a field for each of these, and a short message helps us respond usefully.`],
        list: [
          'Your business name and type',
          'The products you need',
          'The pack sizes you prefer',
          'Your approximate monthly requirement',
          'Your city and state',
          'Whether the requirement is one-off or recurring',
        ],
        after: [`${CONTACTLINK('Open the enquiry form', 'Wholesale / Bulk Purchase')} and choose "Wholesale / Bulk Purchase", or call or email us using the details on the Contact page.`],
      },
      {
        h2: 'The quality behind the supply',
        body: [
          `Every Mamta Bhoj product is milled and packed at our own unit under ISO 9001:2015 and FSSAI-compliant conditions. Our FSSAI State Licence number is %FSSAI%, and the certificate and licence documents are on the ${LINK('/certifications', 'certifications page')}. Wheat is sourced and checked, cleaned and, for our atta, naturally stone-ground; each batch is checked before packing. The ${LINK('/quality', 'Quality &amp; Process page')} and our guide to ${GUIDELINK('how-flour-is-made', 'how flour is made')} explain each step.`,
          `If you are comparing suppliers, our ${GUIDELINK('how-to-choose-flour-supplier', 'checklist for choosing a flour supplier')} sets out what to ask anyone, including us.`,
        ],
      },
      {
        h2: 'Where your flour is made',
        body: [
          `Our unit is in Chaubepur, Kanpur Nagar, Uttar Pradesh. You can read more about the company and the mill on our ${MFRLINK('flour manufacturer page')}.`,
        ],
      },
    ],
    faqs: [
      [
        'What counts as a bulk order?',
        'We do not publish a fixed minimum on this website. Describe your monthly requirement in an enquiry and our team will discuss it with you directly.',
      ],
      [
        'Which pack sizes can I order in bulk?',
        `All five products are available in ${PACKS} packs. If you need another format, mention it in your enquiry and we will tell you what is possible.`,
      ],
      [
        'Do you supply businesses outside Uttar Pradesh?',
        'Our flour is milled in Kanpur, Uttar Pradesh, and we welcome enquiries from businesses across India. Whether and how we can supply a particular location is confirmed during the enquiry, because delivery depends on the location and the requirement.',
      ],
      [
        'Can I see prices on the website?',
        'No. Pricing depends on the product, pack size, quantity and location, so we quote it directly after an enquiry.',
      ],
      [
        'Can I request a sample before ordering in volume?',
        'Sample availability is not listed on this website. Please ask about samples in your enquiry.',
      ],
      ['How soon will I hear back?', 'Our team responds to enquiries within one business day.'],
    ],
    guides: ['bulk-flour-procurement-guide', 'how-to-choose-flour-supplier', 'how-to-store-flour', 'chakki-atta-vs-roller-milled-atta', 'what-is-maida'],
  },

  // ------------------------------------------------------------------
  {
    slug: 'wholesale-flour-supplier',
    title: 'Wholesale Flour Supplier, Dealers & Retailers | Mamta Bhoj',
    h1: 'Wholesale Flour Supplier for Dealers, Traders and Retailers',
    description:
      'Wholesale and resale enquiries for Mamta Bhoj atta, maida, sooji, tandoori atta and besan in 1 kg, 2 kg and 5 kg packs. Dealers and retailers can enquire.',
    eyebrow: 'Wholesale & Resale',
    intro:
      'Mamta Bhoj is a packaged flour range milled by Devmam Flourish Foods LLP in Kanpur, Uttar Pradesh, with five products in 1 kg, 2 kg and 5 kg packs. If you want to stock it, trade in it or build a business around it, this page explains the ways to work with us and what to include in your enquiry.',
    enquiryType: 'Wholesale / Bulk Purchase',
    ctaLabel: 'Send a Wholesale Enquiry',
    productsAfter: 1,
    productsHeading: 'The five products you can stock',
    productsIntro: `Every product is sold in sealed packs of ${PACKS}.`,
    products: [
      ['fresh-chakki-atta', 'The everyday staple: whole wheat atta for daily rotis, chapatis and parathas.'],
      ['tandoori-atta', 'A coarser atta that appeals to restaurant and food-service customers and to home cooks who like tandoori-style breads.'],
      ['maida', 'Refined flour for naan, biscuits and everyday baking, relevant to bakery customers and home bakers alike.'],
      ['sooji-rava', 'Semolina for upma, halwa, dosa batter and snacks, listed under both of its common names.'],
      ['besan', 'Gram flour, a kitchen staple for pakoras, kadhi, chilla and sweets.'],
    ],
    sections: [
      {
        h2: 'A branded range, packed for the shelf',
        body: [
          `Mamta Bhoj is sold under one brand in sealed packs that carry batch and packing details and our FSSAI licence number on the label. For a dealer or retailer, that means one supplier for the core flours a customer buys: atta, maida, sooji and besan, plus a coarser atta for tandoor-style breads.`,
        ],
      },
      {
        h2: 'Ways to work with us',
        body: [`Choose the option closest to your business. The enquiry form will be pre-filled with the type you select.`],
        subs: [
          {
            h3: 'Wholesale or bulk purchase',
            body: [`For wholesalers and traders who buy stock to resell, and for businesses that want a regular supply. ${CONTACTLINK('Start a wholesale enquiry', 'Wholesale / Bulk Purchase')}.`],
          },
          {
            h3: 'Dealership',
            body: [`For businesses that want to represent and sell Mamta Bhoj in their market. ${CONTACTLINK('Enquire about a dealership', 'Dealership')}.`],
          },
          {
            h3: 'Distributorship',
            body: [`For partners who want to build a distribution business around the range. Read about ${B2BLINK('supply-distribution-india', 'supply and distribution enquiries from other states')}, or ${CONTACTLINK('enquire about distributorship', 'Distributorship')}.`],
          },
          {
            h3: 'Retail',
            body: [`For shops and retail businesses that want to stock the range. ${CONTACTLINK('Make a retail enquiry', 'Retailer')}.`],
          },
        ],
      },
      {
        h2: 'Building your assortment',
        body: [
          `There is no single right mix. A neighbourhood grocery might start with atta and one or two other staples, a supplier to bakeries might lean towards maida, and a store that serves restaurants might add tandoori atta. Pack size is part of the decision too: the 1 kg, 2 kg and 5 kg packs suit different shelves and different customers.`,
          `Tell us about your customers and we will discuss which products and sizes fit. Our guide to ${GUIDELINK('what-is-besan', 'besan')} and the comparison of ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki and roller-milled atta')} are useful background if you are explaining the range to buyers.`,
        ],
      },
      {
        h2: 'What to tell us about your business',
        list: [
          'The type of business: shop, wholesaler, trader or distributor',
          'Your city and state',
          'The product categories you already handle',
          'The Mamta Bhoj products and pack sizes you are interested in',
          'Your approximate monthly quantity',
        ],
      },
      {
        h2: 'Check us before you commit',
        body: [
          `We would rather you checked our documents than took our word for it. Our ISO 9001:2015 certificate and FSSAI State Licence are on the ${LINK('/certifications', 'certifications page')}, and our ${GUIDELINK('how-to-choose-flour-supplier', 'supplier checklist')} lists the questions worth asking any flour supplier. The mill is in Kanpur; see the ${MFRLINK('flour manufacturer page')} for details.`,
        ],
      },
    ],
    faqs: [
      [
        'What is the difference between wholesale, dealership and distributorship?',
        'A wholesale purchase means buying stock to resell. A dealership means representing and selling the brand in a market, and a distributorship means building a distribution business around it. Which fits depends on your business, and we discuss it with you directly.',
      ],
      [
        'Can a small retailer enquire?',
        'Yes. Retailers are welcome to enquire. We do not publish a minimum order quantity on this website, so describe what you need and we will respond.',
      ],
      [
        'Are territories or exclusivity offered?',
        'Territory and commercial terms are not published on this website. They are discussed directly during an enquiry.',
      ],
      ['Which pack sizes can I stock?', `All five products are available in ${PACKS} packs.`],
      [
        'Are wholesale prices listed?',
        'No. Wholesale pricing is not listed on this website. Please send an enquiry and our team will respond within one business day.',
      ],
      [
        'Do Mamta Bhoj packs show licence details?',
        'Yes. Our packs carry our FSSAI licence number, along with batch and packing details, on the label.',
      ],
    ],
    guides: ['how-to-choose-flour-supplier', 'types-of-flour-in-india', 'chakki-atta-vs-roller-milled-atta', 'what-is-besan'],
  },

  // ------------------------------------------------------------------
  {
    slug: 'institutional-flour-supplier',
    title: 'Institutional Flour Supplier for Kitchens | Mamta Bhoj',
    h1: 'Institutional Flour Supplier for Kitchens, Caterers and Bakeries',
    description:
      'Flour for restaurants, caterers, canteens and bakeries: Mamta Bhoj chakki atta, tandoori atta, maida, sooji and besan from our Kanpur mill. Enquire today.',
    eyebrow: 'Institutional Supply',
    intro:
      'Commercial kitchens and bakeries need flour that behaves the same on every shift. Devmam Flourish Foods LLP mills the Mamta Bhoj range in Kanpur, Uttar Pradesh. This page maps each product to the kitchens it is made for, so you know what to ask about.',
    enquiryType: 'Institutional / HoReCa',
    ctaLabel: 'Send an Institutional Enquiry',
    productsAfter: 0,
    sections: [
      {
        h2: 'Which flour for which kitchen',
        body: [
          `Different kitchens need different flours. The table below pairs common commercial kitchens with the Mamta Bhoj product to ask about first.`,
        ],
        table: {
          head: ['Kitchen or business', 'What it typically makes', 'Product to ask about'],
          rows: [
            ['Restaurants and dhabas with a tandoor', 'Tandoori roti, thicker parathas, restaurant-style breads', 'Tandoori Atta'],
            ['Canteens, hostels and caterers', 'Rotis, chapatis and parathas in quantity', 'Fresh Chakki Atta'],
            ['Bakeries and sweet shops', 'Naan, bread, biscuits, cakes and pastry', 'Maida'],
            ['Breakfast and tiffin kitchens', 'Upma, dosa and idli batters, halwa', 'Sooji / Rava'],
            ['Namkeen makers and caterers', 'Pakoras, kadhi, chilla and sweets', 'Besan'],
          ],
        },
        after: [
          `Read more about ${PRODLINK('tandoori-atta', 'Tandoori Atta')}, ${PRODLINK('fresh-chakki-atta', 'Fresh Chakki Atta')}, ${PRODLINK('maida', 'Maida')}, ${PRODLINK('sooji-rava', 'Sooji / Rava')} and ${PRODLINK('besan', 'Besan')}. All five are available in ${PACKS} packs.`,
        ],
      },
      {
        h2: 'What institutional buyers look at',
        subs: [
          {
            h3: 'Consistency between deliveries',
            body: [
              `A kitchen that serves hundreds of portions cannot re-learn its dough every week. Consistency in fineness, colour and water absorption is the quality that matters most, which is why a small first order and a few days of trials tell you more than a brochure.`,
            ],
          },
          {
            h3: 'Documents and labelling',
            body: [
              `Ask any supplier for its FSSAI licence and quality certificates. Ours are on the ${LINK('/certifications', 'certifications page')}: an ISO 9001:2015 certificate and an FSSAI State Licence (number %FSSAI%). Our packs also carry batch and packing details. Our ${GUIDELINK('how-to-choose-flour-supplier', 'guide to choosing a flour supplier')} lists what else to check.`,
            ],
          },
          {
            h3: 'Hygienic handling and packing',
            body: [
              `Flour is cleaned, milled, checked and packed at our own unit under ISO 9001:2015 and FSSAI-compliant conditions. The ${LINK('/quality', 'Quality &amp; Process page')} walks through the stages, and the ${MFRLINK('flour manufacturer page')} describes the unit itself.`,
            ],
          },
        ],
      },
      {
        h2: 'Planning supply for your kitchen',
        subs: [
          {
            h3: 'Tell us your menu',
            body: [
              `The breads and dishes you make decide the flour. If you bake naan or kulcha, maida is the starting point; if you cook breads in a tandoor, ask about tandoori atta. Our guides on ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki and roller-milled atta')} and the ${GUIDELINK('tandoori-atta-guide', 'difference tandoori atta makes')} may help.`,
            ],
          },
          {
            h3: 'Pack sizes',
            body: [`Packs come in ${PACKS}. If a different format would suit your kitchen better, say so in your enquiry.`],
          },
          {
            h3: 'Storing flour in a commercial kitchen',
            body: [
              `Keep packs sealed and dry in a cool store, away from direct sunlight and moisture, off the floor where possible, and use older stock first.`,
            ],
          },
          {
            h3: 'Delivery and schedule',
            body: [
              `Delivery depends on your location and how often you need flour, so it is discussed per enquiry. We do not publish delivery timelines or minimum quantities on this website.`,
            ],
          },
        ],
      },
      {
        h2: 'How to start',
        steps: [
          ['Send an enquiry', 'Use the enquiry form and choose "Institutional / HoReCa" as the type.'],
          ['Describe your kitchen', 'Tell us what you cook or bake, the flours you use now and roughly how much you need each month.'],
          ['We respond', 'Our team responds within one business day.'],
          ['Discuss the details', 'Products, pack sizes, prices and delivery are agreed directly with you.'],
        ],
      },
    ],
    faqs: [
      [
        'Which Mamta Bhoj flour is made for a tandoor?',
        'Tandoori Atta is a coarser stone-ground wheat flour made for tandoori rotis and thicker parathas, aimed at kitchens that cook breads in a tandoor.',
      ],
      [
        'Can a canteen or hostel kitchen use Fresh Chakki Atta?',
        'Fresh Chakki Atta is a whole wheat atta suited to home and food-service kitchens that make rotis, chapatis and parathas every day.',
      ],
      [
        'Which documents can I check before choosing Mamta Bhoj?',
        'Our ISO 9001:2015 certificate and FSSAI State Licence can be viewed on our certifications page, and our licence number is printed on our packs.',
      ],
      [
        'Do you offer samples for a trial?',
        'Sample availability is not listed on this website. Please ask in your enquiry and describe the kitchen or product you want to test.',
      ],
      [
        'Can you supply a recurring requirement?',
        'You can describe a recurring need in your enquiry. Supply arrangements, prices, minimum quantities and delivery depend on your requirement and location and are discussed directly.',
      ],
      ['What pack sizes are available?', `All five products are available in ${PACKS} packs.`],
    ],
    guides: ['tandoori-atta-guide', 'what-is-maida', 'how-to-choose-flour-supplier', 'bulk-flour-procurement-guide', 'how-to-store-flour'],
  },

  // ------------------------------------------------------------------
  {
    slug: 'supply-distribution-india',
    title: 'Flour Supply & Distribution Enquiries, India | Mamta Bhoj',
    h1: 'Flour Supply and Distribution Enquiries From Across India',
    description:
      'Mamta Bhoj is milled in Kanpur and we are planning wider distribution across India. Dealers, distributors and wholesale buyers in any state can enquire.',
    eyebrow: 'Supply & Distribution',
    intro:
      'Mamta Bhoj flour is milled at one unit, in Kanpur, Uttar Pradesh. We are planning to extend distribution across India, and we want to hear from dealers, distributors and wholesale buyers in other states. This page explains how that conversation works, and is careful about what it does not promise.',
    enquiryType: 'Distributorship',
    ctaLabel: 'Send a Distribution Enquiry',
    productsAfter: -1,
    sections: [
      {
        h2: 'Where the flour is made',
        body: [
          `Everything in the Mamta Bhoj range is milled and packed at our unit in Chaubepur, Kanpur Nagar, Uttar Pradesh (${escapeHtml(BUSINESS_ADDRESS)}). We do not currently publish any other office or warehouse on this website. If you are in another state, we discuss what is workable for your location during the enquiry. Read more on the ${MFRLINK('flour manufacturer page')}.`,
        ],
      },
      {
        h2: 'Who we want to hear from',
        list: [
          'Dealers who want to represent Mamta Bhoj in a city or region',
          'Distributors with an existing network for food or grocery products',
          'Wholesalers and traders in other states',
          'Institutional buyers, such as caterers and canteen operators, with more than one site',
          'Retail businesses and chains that want to stock a packaged flour range',
        ],
      },
      {
        h2: 'How a supply or distribution enquiry works',
        steps: [
          ['Send your details', 'Use the Contact page and choose the enquiry type closest to your business, such as Distributorship or Wholesale / Bulk Purchase.'],
          ['We respond', 'Our team responds within one business day.'],
          ['We talk through your location', 'We discuss the products and pack sizes you are interested in, your approximate volume, and what is workable for your location.'],
          ['Terms are agreed directly', 'Prices, quantities, delivery and any other terms are discussed and agreed directly with you.'],
        ],
      },
      {
        h2: 'What to include in your enquiry',
        list: [
          'Your business name and your city and state',
          'The area you would like to serve',
          'The products and pack sizes you are interested in',
          'Your approximate monthly quantity',
          'Any existing distribution or trade experience (optional)',
        ],
        after: [`${CONTACTLINK('Open the enquiry form', 'Distributorship')} and choose the type that fits.`],
      },
      {
        h2: 'What this page does not promise',
        body: [
          `We do not list states, delivery timelines, minimum quantities, prices or territories here. They are decided case by case, and we would rather not promise coverage before it is confirmed. If you want to understand the products first, our ${GUIDELINK('how-to-choose-flour-supplier', 'supplier checklist')} and the ${LINK('/certifications', 'certifications page')} show what we can document today.`,
        ],
      },
      {
        h2: 'The Mamta Bhoj range',
        body: [
          `Five products, each available in ${PACKS} packs: ${PRODLINK('fresh-chakki-atta', 'Fresh Chakki Atta')}, ${PRODLINK('tandoori-atta', 'Tandoori Atta')}, ${PRODLINK('maida', 'Maida')}, ${PRODLINK('sooji-rava', 'Sooji / Rava')} and ${PRODLINK('besan', 'Besan')}. You can also browse the full ${LINK('/products', 'product range')}.`,
        ],
      },
    ],
    faqs: [
      [
        'Do you have a warehouse or office outside Kanpur?',
        'Mamta Bhoj is milled and packed at our unit in Kanpur, Uttar Pradesh. We do not currently publish any other office or warehouse location on this website. For arrangements in your state, please ask in your enquiry.',
      ],
      [
        'Which states do you supply?',
        'We do not publish a list of states. We welcome enquiries from every state, and what is workable for a particular location is confirmed during the enquiry.',
      ],
      [
        'How do I apply to become a distributor?',
        'Use the Contact page, choose Distributorship as the enquiry type, and tell us your city and state, the area you want to serve and the products you are interested in. Our team will respond within one business day.',
      ],
      [
        'Are exclusive territories available?',
        'Territory and exclusivity are not published on this website. Like all commercial terms, they are discussed directly.',
      ],
      [
        'Can an institutional buyer with several locations enquire?',
        'Yes. Mention your locations, the products you need and your approximate monthly requirement in the enquiry.',
      ],
      [
        'Where can I buy Mamta Bhoj near me?',
        'This website does not list retail stockists. If you are a business that wants to stock Mamta Bhoj, please send an enquiry.',
      ],
    ],
    guides: ['how-to-choose-flour-supplier', 'bulk-flour-procurement-guide', 'how-flour-is-made'],
  },
];

// Fail loudly at start-up if the sitemap's slug list and this file drift apart.
if (B2B_PAGES.map((p) => p.slug).join() !== seo.B2B_PAGE_SLUGS.join()) {
  throw new Error('views/b2b-pages.js B2B_PAGES and lib/seo.js B2B_PAGE_SLUGS are out of sync');
}

function findB2BPage(slug) {
  return B2B_PAGES.find((p) => p.slug === slug) || null;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function arrowIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function tableHtml(t) {
  return `<div class="compare-wrap"><table class="compare">
    <thead><tr>${t.head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr><th scope="row">${escapeHtml(r[0])}</th>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function sectionHtml(s, fssai) {
  const sub = (txt) => String(txt).replace(/%FSSAI%/g, escapeHtml(fssai || ''));
  const parts = [`<h2${s.id ? ` id="${escapeHtml(s.id)}"` : ''}>${escapeHtml(s.h2)}</h2>`];
  (s.body || []).forEach((p) => parts.push(`<p>${sub(p)}</p>`));
  if (s.list) parts.push(`<ul class="prose-list">${s.list.map((li) => `<li>${escapeHtml(sub(li))}</li>`).join('')}</ul>`);
  if (s.steps) parts.push(`<ol class="prose-steps">${s.steps.map(([t, d]) => `<li><strong>${escapeHtml(t)}.</strong> ${escapeHtml(d)}</li>`).join('')}</ol>`);
  if (s.table) parts.push(tableHtml(s.table));
  (s.subs || []).forEach((u) => {
    parts.push(`<h3>${escapeHtml(u.h3)}</h3>`);
    (u.body || []).forEach((p) => parts.push(`<p>${sub(p)}</p>`));
    if (u.list) parts.push(`<ul class="prose-list">${u.list.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>`);
  });
  (s.after || []).forEach((p) => parts.push(`<p>${sub(p)}</p>`));
  return parts.join('\n');
}

function productsBlock(page, products) {
  const bySlug = new Map(products.map((p) => [slugify(p.name), p]));
  const cards = page.products
    .map(([slug, note]) => {
      const p = bySlug.get(slug);
      if (!p) return '';
      return `<div class="why-card b2b-product" data-reveal-item>
        <h3><a href="/products/${slug}">Mamta Bhoj ${escapeHtml(p.name)}</a></h3>
        <p>${escapeHtml(note)}</p>
        <a href="/products/${slug}" class="know-more">View ${escapeHtml(p.name)} details ${arrowIcon()}</a>
      </div>`;
    })
    .join('');
  return `<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">The Range</span><h2>${escapeHtml(page.productsHeading)}</h2>${page.productsIntro ? `<p>${escapeHtml(page.productsIntro)}</p>` : ''}</div>
  <div class="partner-grid">${cards}</div>
</section>`;
}

function faqHtml(faqs) {
  return faqs
    .map(([q, a]) => `<details class="faq-item"><summary>${escapeHtml(q)}${arrowIcon()}</summary><p>${escapeHtml(a)}</p></details>`)
    .join('');
}

function renderB2BPage(page, content, products) {
  const fssai = content.fssai || '';
  const proseSections = page.sections.map((s) => `<section class="wrap" data-reveal><div class="prose">${sectionHtml(s, fssai)}</div></section>`);
  const body = [];
  proseSections.forEach((html, i) => {
    body.push(html);
    if (page.products && page.productsAfter === i) body.push(productsBlock(page, products));
  });
  const otherPages = B2B_LINKS.filter((l) => l.slug !== page.slug);
  const pageIdx = B2B_LINKS.findIndex((l) => l.slug === page.slug);
  const guideLinks = (page.guides || []).map(findGuide).filter(Boolean);
  return `
<section class="wrap" data-reveal>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(page.crumb || page.eyebrow)}</span>
  </nav>
</section>

<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">${escapeHtml(page.eyebrow)}</span>
  <h1>${escapeHtml(page.h1)}</h1>
  <p>${escapeHtml(page.intro)}</p>
  <div class="hero-cta" style="margin-top:1.4em;">
    <a href="${enquiryHref(page.enquiryType)}" class="btn btn-primary">${escapeHtml(page.ctaLabel)} ${arrowIcon()}</a>
    <a href="/products" class="btn btn-ghost">View All Products</a>
  </div>
</section>

${body.join('\n\n')}

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Common Questions</span><h2>Frequently asked questions</h2></div>
  <div class="faq-list">${faqHtml(page.faqs)}</div>
</section>

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Keep Exploring</span><h2>Other ways to work with us, and further reading</h2></div>
  <ul class="guide-links">
    ${otherPages.map((l, i) => `<li><a href="/${l.slug}">${escapeHtml(cap(b2bAnchor(l.slug, pageIdx + i)))}</a></li>`).join('')}
    <li><a href="${seo.MANUFACTURER_PATH}">Devmam Flourish Foods, flour manufacturer in Kanpur</a></li>
    ${guideLinks.map((g) => `<li><a href="/guides/${g.slug}">${escapeHtml(g.h1)}</a></li>`).join('')}
  </ul>
</section>
${ctaBand(content)}
`;
}

module.exports = { B2B_PAGES, findB2BPage, renderB2BPage };
