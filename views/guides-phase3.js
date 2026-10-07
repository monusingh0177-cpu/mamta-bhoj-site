'use strict';
const { PRODLINK, GUIDELINK, MFRLINK, CONTACTLINK, B2BLINK, LINK } = require('./links');
const { packSizesText } = require('../lib/business');

// Phase-3 guides. Same rules as views/guides.js and views/guides-more.js:
// general milling, storage and cooking facts only (hedged where practice varies
// between mills and kitchens); claims about Mamta Bhoj limited to what the site
// already publishes (pack sizes, ISO 9001:2015 / FSSAI, stone-ground atta, the
// Chakki Atta fibre-and-protein claim); no prices, MOQ, delivery promises, shelf-life
// numbers, nutrition or health claims, and no dates. Each guide answers a real
// buying or kitchen question and links onward to the relevant products, supply
// pages and the manufacturer pages. Body strings are trusted hand-written HTML.

const PACKS = packSizesText();

const PHASE3_GUIDES = [
  // ------------------------------------------------------------------
  {
    slug: 'how-to-choose-atta',
    title: 'How to Choose Good Atta: What to Check | Mamta Bhoj',
    h1: 'How to Choose Good Atta: What to Check Before You Buy',
    shortTitle: 'How to choose atta',
    description:
      'What to read on an atta pack and how to check freshness, milling method and pack size, with a simple dough test you can do at home or in a kitchen.',
    cardText: 'The label, the smell, the milling method and a simple dough test: a short checklist for buying atta.',
    intro:
      'Most shelves carry a dozen kinds of atta that look alike. A few minutes with the pack, and one small test at home, tell you far more than the brand name or the colour does. This checklist works for a household buying 1 kg and for a kitchen buying in volume.',
    products: ['fresh-chakki-atta', 'tandoori-atta'],
    related: ['chakki-atta-vs-roller-milled-atta', 'how-to-store-flour', 'maida-vs-atta'],
    business: ['flour-manufacturer-india', 'institutional-flour-supplier'],
    sections: [
      {
        h2: 'Start with the label',
        body: [
          `A pack tells you most of what you need if you know where to look.`,
        ],
        list: [
          'The name: "whole wheat atta" describes the flour; plain "atta" does not say how much of the grain is in it.',
          'The ingredients: plain atta should list wheat and nothing else. Look for anything added that you did not expect.',
          'The FSSAI licence number of the packer, which should be printed on the pack.',
          'Batch and packing details and a best-before date.',
          'Net weight and storage instructions.',
        ],
      },
      {
        h2: 'Whole wheat, refined or blended?',
        body: [
          `Whole wheat atta is milled with the bran and germ included, which is why it is light brown and slightly coarse. Maida is refined, with the bran and germ removed. Some packs are blends of several grains. None of these is wrong; they suit different cooking. Our guide to ${GUIDELINK('maida-vs-atta', 'maida and atta')} lays out the difference, and the ${GUIDELINK('types-of-flour-in-india', 'types of flour in India')} guide compares all the common flours.`,
        ],
      },
      {
        h2: 'Chakki or roller-milled?',
        body: [
          `Chakki atta is ground between stones; roller-milled atta is ground and separated on rollers. Neither is automatically better. Chakki atta usually looks a little more rustic and many cooks like the softness of the rotis it makes. What matters is that the pack states how it is milled and that the flour is fresh. The full comparison is in ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki atta vs roller-milled atta')}.`,
        ],
      },
      {
        h2: 'Check freshness with your senses',
        subs: [
          {
            h3: 'Smell',
            body: [`Fresh atta smells mild and slightly sweet, like wheat. A musty, sour or bitter smell means the flour is old, has taken in moisture or has turned.`],
          },
          {
            h3: 'Look and feel',
            body: [
              `Atta should be a loose, even powder. Lumps that do not break easily point to moisture. Small dark specks or webbing mean insects. Colour is a weak guide on its own: it varies with the wheat variety and the milling, so a darker or lighter atta is not automatically better or worse.`,
            ],
          },
        ],
      },
      {
        h2: 'A simple dough test',
        body: [`Before committing to a large pack, or a first bulk order, knead a small batch and cook a few rotis.`],
        steps: [
          ['Knead', 'Mix about a cupful of atta with water, a little at a time, and knead for a few minutes. Note how much water it takes.'],
          ['Rest', 'Cover the dough and rest it for twenty to thirty minutes. Good atta dough turns smoother and easier to roll.'],
          ['Roll', 'Roll a few rotis. They should roll out without tearing or springing back too hard.'],
          ['Cook', 'Cook on a hot tawa. Notice how they puff, how they taste and whether they are still soft an hour later.'],
        ],
        after: [
          `Results also depend on water, kneading, resting time and the tawa, so compare two flours the same way, on the same day, with the same method.`,
        ],
      },
      {
        h2: 'Choose a pack size you will finish',
        body: [
          `Atta is best used while fresh, so buy the pack you will finish in a reasonable time. A small household may prefer the smaller packs; a larger family or a small kitchen may prefer the largest. Mamta Bhoj is packed in ${PACKS}. Whatever you choose, store it as described in our guide to ${GUIDELINK('how-to-store-flour', 'storing flour')}.`,
        ],
      },
      {
        h2: 'Where Mamta Bhoj Fresh Chakki Atta fits',
        body: [
          `${PRODLINK('fresh-chakki-atta', 'Mamta Bhoj Fresh Chakki Atta')} is 100% whole wheat and naturally stone-ground, made for everyday rotis, chapatis and parathas. Each pack carries the FSSAI licence number, batch and packing details and the nutrition information. For tandoor cooking, the coarser ${PRODLINK('tandoori-atta', 'Tandoori Atta')} may suit better.`,
          `Buying for a kitchen, canteen or shop? See ${B2BLINK('flour-manufacturer-india', 'an atta, maida, sooji and besan manufacturer')} and ${B2BLINK('institutional-flour-supplier', 'institutional supply for kitchens and bakeries')}, or ${CONTACTLINK('send an enquiry', 'Institutional / HoReCa')}.`,
        ],
      },
    ],
    faqs: [
      [
        'Is whole wheat atta the same as chakki atta?',
        'Not necessarily. "Whole wheat" describes the flour, which includes the whole grain. "Chakki" describes how it is ground, between stones. Chakki atta is usually whole wheat, but read the label to be sure.',
      ],
      [
        'How can I tell whether atta is fresh?',
        'Check the batch, packing and best-before details on the pack, then smell the flour. It should smell mild and slightly sweet. A musty, sour or bitter smell means it is old or has taken in moisture.',
      ],
      [
        'Does darker atta mean better atta?',
        'No. Colour depends on the wheat variety and the milling, so it is not a reliable sign of quality by itself. Use the label, the smell and a dough test instead.',
      ],
      [
        'Which pack size should I buy?',
        `Buy the size you will finish while the flour is fresh. Mamta Bhoj is available in ${PACKS}. Smaller packs suit smaller households; larger packs suit bigger families and kitchens that use atta daily.`,
      ],
      [
        'Can I use ordinary atta for tandoori roti?',
        'You can, but tandoori-style breads are usually made with a coarser grind. Our tandoori atta guide explains the difference.',
      ],
    ],
  },

  // ------------------------------------------------------------------
  {
    slug: 'types-of-flour-in-india',
    title: 'Types of Flour in India Explained | Mamta Bhoj',
    h1: 'Types of Flour in India: Atta, Maida, Sooji, Besan and How They Differ',
    shortTitle: 'Types of flour in India',
    description:
      'A side-by-side guide to atta, tandoori atta, maida, sooji (rava) and besan: what each is made from, how it feels and which dishes it suits.',
    cardText: 'Atta, tandoori atta, maida, sooji and besan compared in one table, with the dishes each one suits.',
    intro:
      'Indian kitchens use several flours, and the names are easy to mix up. Four of the five most common come from wheat and one comes from chana dal. This guide puts them side by side so you can pick the right one for the dish or the product you are making.',
    products: ['fresh-chakki-atta', 'tandoori-atta', 'maida', 'sooji-rava', 'besan'],
    related: ['maida-vs-atta', 'sooji-vs-rava', 'what-is-besan', 'how-to-choose-atta'],
    business: ['flour-manufacturer-india', 'wholesale-flour-supplier'],
    sections: [
      {
        h2: 'The five flours side by side',
        table: {
          head: ['Flour', 'Made from', 'Feel', 'Common uses', 'Mamta Bhoj product'],
          rows: [
            ['Atta', 'Whole wheat grain', 'Light brown, slightly coarse', 'Rotis, chapatis, parathas', 'Fresh Chakki Atta'],
            ['Tandoori atta', 'Wheat, milled coarser', 'Coarser than everyday atta', 'Tandoori rotis, thicker parathas', 'Tandoori Atta'],
            ['Maida', 'Wheat endosperm only', 'Very fine, pale', 'Naan, biscuits, bakery items, pastry', 'Maida'],
            ['Sooji / rava', 'Wheat, as semolina', 'Small even granules', 'Upma, halwa, dosa batter, snacks', 'Sooji / Rava'],
            ['Besan', 'Chana dal (gram)', 'Fine, yellow', 'Pakoras, chilla, kadhi, sweets', 'Besan'],
          ],
        },
      },
      {
        h2: 'Wheat flours: one grain, different cuts',
        body: [
          `Atta, maida and sooji all start as wheat. What differs is which part of the grain is used and how finely it is ground. Atta uses the whole grain. Maida uses only the starchy centre, finely ground. Sooji is a coarser, granular milling of the wheat rather than a powder. Tandoori atta sits next to everyday atta: the same whole-grain idea, ground coarser.`,
          `For the detail on any pair, see ${GUIDELINK('maida-vs-atta', 'maida vs atta')}, ${GUIDELINK('sooji-vs-rava', 'sooji vs rava')} and the ${GUIDELINK('tandoori-atta-guide', 'tandoori atta guide')}. ${GUIDELINK('how-flour-is-made', 'How flour is made')} explains the milling behind all of them.`,
        ],
      },
      {
        h2: 'Besan is not a wheat flour',
        body: [
          `Besan, also called gram flour, is milled from chana dal, a pulse, not from wheat. It behaves very differently from wheat flour: it has no gluten structure, so it makes batters and pastes rather than a stretchy dough. That is why it is used for pakoras, chilla and kadhi. Read more in ${GUIDELINK('what-is-besan', 'what besan is')}.`,
        ],
      },
      {
        h2: 'Choosing by dish',
        table: {
          head: ['If you are making', 'Reach for', 'Why'],
          rows: [
            ['Everyday rotis and parathas', 'Atta', 'Whole grain gives a soft, pliable dough'],
            ['Tandoori rotis', 'Tandoori atta', 'A coarser grind is made for tandoor-style breads'],
            ['Naan, kulcha, biscuits, pastry', 'Maida', 'Fine, refined flour gives a smooth, elastic dough'],
            ['Upma, halwa, dosa batter', 'Sooji / rava', 'Even granules cook at a steady rate'],
            ['Pakoras, chilla, kadhi, ladoo', 'Besan', 'Chana dal flour sets and binds without gluten'],
          ],
        },
        after: [
          `Some recipes mix flours, for example atta with maida in certain breads. The table shows the usual main choice, not a rule.`,
        ],
      },
      {
        h2: 'Other flours you will see',
        body: [
          `Rice flour, ragi, jowar, bajra and multigrain blends are also common. Millet and rice flours are gluten-free, so they do not rise or roll the way wheat dough does, and they are used for different dishes. This guide covers the five flours that Mamta Bhoj mills, listed in the table above: ${PRODLINK('fresh-chakki-atta', 'Fresh Chakki Atta')}, ${PRODLINK('tandoori-atta', 'Tandoori Atta')}, ${PRODLINK('maida', 'Maida')}, ${PRODLINK('sooji-rava', 'Sooji / Rava')} and ${PRODLINK('besan', 'Besan')}, each in ${PACKS} packs.`,
        ],
      },
      {
        h2: 'Buying these flours for a business',
        body: [
          `Dealers, bakeries, sweet shops and kitchens can read about ${B2BLINK('flour-manufacturer-india', 'a manufacturer that makes all five flours')} or about ${B2BLINK('wholesale-flour-supplier', 'wholesale supply for dealers and retailers')}. Devmam Flourish Foods LLP mills them at its unit in Kanpur; see ${MFRLINK('our flour manufacturer in Kanpur page')}.`,
        ],
      },
    ],
    faqs: [
      [
        'What is the difference between atta, maida and sooji?',
        'All three come from wheat. Atta uses the whole grain, maida uses only the refined centre of the grain and is very fine, and sooji is a coarser, granular milling used for dishes such as upma and halwa.',
      ],
      ['Is besan made from wheat?', 'No. Besan is milled from chana dal, which is a pulse.'],
      [
        'Which flour is best for roti?',
        'Atta is the usual choice for everyday rotis and parathas. Tandoori rotis are usually made with a coarser tandoori atta.',
      ],
      [
        'Can I use atta instead of maida?',
        'In some recipes, but the result will differ. Atta gives a denser, darker, more rustic result than maida, so it is not a like-for-like swap in bakery items.',
      ],
      ['Are sooji and rava the same thing?', 'Yes. Both names refer to semolina, used in different regions of India.'],
    ],
  },

  // ------------------------------------------------------------------
  {
    slug: 'how-to-store-flour',
    title: 'How to Store Atta, Maida, Sooji & Besan | Mamta Bhoj',
    h1: 'How to Store Atta, Maida, Sooji and Besan at Home and in Bulk',
    shortTitle: 'How to store flour',
    description:
      'How to keep atta, maida, sooji and besan dry, cool and free of pests: containers, shelf placement, stock rotation and the signs flour has gone off.',
    cardText: 'Containers, shelf placement, stock rotation and the signs that flour has gone off, for homes and for bulk stock.',
    intro:
      'Flour is a dry food, but it is not an indestructible one. Moisture, heat, insects and strong smells all spoil it, and the damage is slow enough that it often goes unnoticed until a batch of rotis tastes wrong. A few habits protect it at home, and a few more matter when you hold flour in volume.',
    products: ['fresh-chakki-atta', 'maida', 'sooji-rava', 'besan'],
    related: ['how-to-choose-atta', 'bulk-flour-procurement-guide', 'types-of-flour-in-india'],
    business: ['bulk-flour-supplier-india', 'institutional-flour-supplier'],
    sections: [
      {
        h2: 'What spoils flour',
        list: [
          'Moisture: flour absorbs it from humid air, which causes lumps, mould and a sour smell.',
          'Heat: warm storage speeds up staleness and encourages insects.',
          'Insects: weevils and flour moths breed in flour that stays untouched in a warm place.',
          'Strong smells: flour picks up odours from spices, pickles and cleaning products stored nearby.',
          'Light and air: long exposure dulls flavour, especially once a pack is open.',
        ],
      },
      {
        h2: 'Storing flour at home',
        subs: [
          {
            h3: 'Use an airtight container',
            body: [
              `Once a pack is opened, keep the flour sealed. Either close the pack firmly or move the flour to a clean, dry, airtight, food-grade container. Dry the container fully before filling it, and label it with the date you opened the pack.`,
            ],
          },
          {
            h3: 'Pick the right spot',
            body: [
              `Choose a cool, dry shelf away from the stove, the sink and direct sunlight. Keep flour away from strong-smelling items. Use a clean, dry spoon or scoop every time, never a wet one.`,
            ],
          },
          {
            h3: 'Do not top up old flour with new',
            body: [
              `Finish a container before refilling it. Topping up mixes fresh flour with older flour and hides any problem in the old batch.`,
            ],
          },
        ],
      },
      {
        h2: 'Flour by flour',
        table: {
          head: ['Flour', 'What to know'],
          rows: [
            ['Atta', 'Whole wheat atta includes the germ, which carries natural oils, so whole-grain flours generally keep for less time than refined ones. Buy a pack size you will finish and keep it cool and sealed.'],
            ['Maida', 'Refined flour generally keeps longer than atta, but it still absorbs moisture and odours. Keep it sealed and dry.'],
            ['Sooji / rava', 'A dry, granular flour that is easy to store, but vulnerable to pantry insects once the pack is open. Keep it in a tightly closed container.'],
            ['Besan', 'Absorbs moisture and smells readily and can clump. Keep it airtight and use a dry spoon.'],
          ],
        },
        after: [
          `These are general notes. Always follow the best-before date and storage instructions printed on the pack. Mamta Bhoj packs are sealed and should be stored in a cool, dry place away from direct sunlight and moisture.`,
        ],
      },
      {
        h2: 'Storing flour in bulk',
        body: [`If you hold flour for a kitchen, bakery or shop, a few extra habits matter.`],
        list: [
          'Keep sacks and cartons off the floor, on racks or pallets, and a little away from the wall so air can move.',
          'Choose a dry, ventilated, cool room. Avoid places near drains, boilers or ovens.',
          'Use first in, first out: store each delivery separately, note the batch and date, and use the oldest stock first.',
          'Check packs on arrival for damaged seals, damp patches or insects, and set aside any damaged pack.',
          'Keep flour away from chemicals and strong-smelling goods. Follow your licensed pest-control provider’s advice and keep treatments away from food stock.',
          'Match order size and frequency to the space you have and how fast you use flour. Smaller, more frequent orders keep stock fresher when storage is limited.',
        ],
        after: [
          `More on planning the order itself is in our ${GUIDELINK('bulk-flour-procurement-guide', 'bulk flour procurement guide')}. For supply for a kitchen or bakery, see ${B2BLINK('bulk-flour-supplier-india', 'bulk flour supply')} and ${B2BLINK('institutional-flour-supplier', 'institutional supply for kitchens and bakeries')}.`,
        ],
      },
      {
        h2: 'Signs that flour has gone off',
        list: [
          'A musty, sour, bitter or oily smell.',
          'Lumps that stay hard, damp patches, or visible mould.',
          'Small insects, webbing or fine dark specks.',
          'Noticeably flat taste in rotis or baked items.',
        ],
        after: [`If you see these signs, do not use the flour. Throw it away, clean the container and the shelf, and start with a fresh pack.`],
      },
    ],
    faqs: [
      [
        'Should I keep atta in the fridge?',
        'Some households do in humid or very hot weather, in a sealed container. It is not essential if the flour is kept sealed in a cool, dry place and used in reasonable time. If you do refrigerate it, let it reach room temperature in its sealed container before opening so moisture does not condense on it.',
      ],
      [
        'Why does flour get insects?',
        'Weevils and flour moths breed in flour that sits for a long time in a warm, humid place, often from eggs already in the pack or the cupboard. Airtight containers, cool storage and finishing a pack before buying the next one reduce the risk.',
      ],
      [
        'How long does flour last?',
        'It depends on the flour, the packaging and the storage conditions, so we do not give a single figure. Follow the best-before date on the pack, and use the signs of spoilage above as a check.',
      ],
      [
        'Can I store flour in its original pack?',
        'Yes, if the pack is sealed and undamaged. Once opened, close it firmly or move the flour to an airtight container.',
      ],
      [
        'What is the best way to store flour for a bakery or kitchen?',
        'Keep it off the floor, in a cool, dry, ventilated room, use first in, first out, and check every delivery for damage. The bulk storage section above has a full checklist.',
      ],
    ],
  },

  // ------------------------------------------------------------------
  {
    slug: 'bulk-flour-procurement-guide',
    title: 'Bulk Flour Procurement Guide for Buyers | Mamta Bhoj',
    h1: 'Buying Flour in Bulk: How to Plan the Order, from Estimate to Storage',
    shortTitle: 'Bulk flour procurement guide',
    description:
      'How to plan a bulk flour order: estimate monthly need, choose pack sizes, run a trial, set the order rhythm and storage, and agree terms in writing.',
    cardText: 'Six steps for planning a bulk flour order: the estimate, the trial, the order rhythm, storage and written terms.',
    intro:
      'Once you have decided to buy flour in volume, most of the work is planning the order itself: how much, in what packs, how often, where it will be kept and what is agreed in writing. This guide covers those steps. Choosing which supplier to trust is a separate question, answered in our supplier checklist.',
    products: ['fresh-chakki-atta', 'maida', 'sooji-rava', 'besan'],
    related: ['how-to-choose-flour-supplier', 'how-to-store-flour', 'types-of-flour-in-india', 'how-to-choose-atta'],
    business: ['bulk-flour-supplier-india', 'wholesale-flour-supplier', 'flour-manufacturer-india'],
    sections: [
      {
        h2: 'Step 1: List what you actually use',
        body: [
          `Start from your last two or three months of purchases rather than a guess. Note each flour, what it is used for and how much goes through in a month. A simple worksheet is enough.`,
        ],
        table: {
          head: ['Flour', 'Used for', 'Kilograms per month', 'Pack size', 'Order every'],
          rows: [
            ['Atta', 'Rotis, parathas', 'Write your figure', 'Write your choice', 'Write your interval'],
            ['Maida', 'Bakery, naan', 'Write your figure', 'Write your choice', 'Write your interval'],
            ['Sooji', 'Upma, halwa', 'Write your figure', 'Write your choice', 'Write your interval'],
            ['Besan', 'Snacks, sweets', 'Write your figure', 'Write your choice', 'Write your interval'],
          ],
        },
        after: [`Add a small allowance for busy seasons. If demand swings widely, say so when you talk to a supplier.`],
      },
      {
        h2: 'Step 2: Match the flour and the pack size',
        body: [
          `Name the dish or product, not just the flour: a tandoor kitchen, a bakery and a sweet shop each need a different match. The ${GUIDELINK('types-of-flour-in-india', 'types of flour in India')} guide compares the flours, and ${B2BLINK('institutional-flour-supplier', 'institutional supply for kitchens and bakeries')} pairs common kitchens with the Mamta Bhoj product to ask about first.`,
          `Then think about pack size. Mamta Bhoj comes in ${PACKS}. Smaller packs are easier to handle and finish while fresh; larger packs mean fewer deliveries to receive and store.`,
        ],
      },
      {
        h2: 'Step 3: Choose and verify the supplier',
        body: [
          `Compare two or three suppliers on the same points: licence, certificate scope, labels, consistency and the questions to ask. We keep that checklist in one place rather than repeat it here: ${GUIDELINK('how-to-choose-flour-supplier', 'how to choose a flour supplier')}. Devmam Flourish Foods LLP mills and packs Mamta Bhoj at its own unit in Kanpur; ${B2BLINK('flour-manufacturer-india', 'our manufacturer overview')} shows what we make and how to evaluate us on that checklist.`,
        ],
      },
      {
        h2: 'Step 4: Run a trial before you commit',
        body: [
          `Start with a smaller order and use it in your real recipes, not a test batch. Compare the same flour across two or three deliveries; a good first sample that varies later is a problem you want to find early. Sample availability is not listed on this website, so ask about samples in your enquiry.`,
        ],
      },
      {
        h2: 'Step 5: Set the order rhythm and the storage plan',
        body: [
          `Match how often you order to the space you have and how fast you use flour. If space is tight, smaller and more frequent orders keep stock fresher; if deliveries are costly or slow, a larger order needs better storage. Use first in, first out, record batch details from each delivery, and keep stock off the floor. The full storage checklist is in ${GUIDELINK('how-to-store-flour', 'how to store flour')}.`,
        ],
      },
      {
        h2: 'Step 6: Agree the terms in writing',
        list: [
          'Price basis: per kilogram or per pack, and what is included.',
          'Payment terms and when invoices are due.',
          'Delivery: how, how often and to which address.',
          'What happens if a delivery is damaged or does not match the agreed product.',
          'How and when either side can change the quantity.',
        ],
        after: [
          `Pricing, minimum quantities and delivery depend on the product and your requirement, so we do not publish them on this website. Discuss them in an enquiry.`,
        ],
      },
      {
        h2: 'Where to go next',
        body: [
          `Read about ${B2BLINK('bulk-flour-supplier-india', 'bulk flour supply')}, ${B2BLINK('wholesale-flour-supplier', 'wholesale supply for dealers and retailers')} or ${B2BLINK('supply-distribution-india', 'supply and distribution enquiries from other states')}, then ${CONTACTLINK('send an enquiry', 'Wholesale / Bulk Purchase')}. Tell us the products, your approximate monthly requirement, your pack-size preference and your city and state.`,
        ],
      },
    ],
    faqs: [
      [
        'How do I estimate my monthly flour requirement?',
        'Use your last two or three months of purchases, split by flour and by use, and add a small allowance for busy periods. A rough, honest figure is more useful to a supplier than a precise-looking guess.',
      ],
      [
        'Is it better to order often in small quantities or rarely in large ones?',
        'It depends on your storage and how fast you use flour. Smaller, more frequent orders keep stock fresher when space is limited; larger orders suit a dry, ventilated store and steady use.',
      ],
      [
        'Why run a trial order first?',
        'A single good sample does not show how the flour behaves from one delivery to the next. A smaller first order used in real recipes shows consistency before you commit to volume.',
      ],
      [
        'What should be agreed in writing?',
        'The price basis, payment terms, delivery arrangements, what happens if a delivery is damaged or wrong, and how the quantity can be changed.',
      ],
      [
        'Does Mamta Bhoj publish a minimum order quantity?',
        'No. We do not publish minimum quantities, prices or delivery terms on this website. Describe your requirement in an enquiry and our team will discuss it directly.',
      ],
    ],
  },
];

module.exports = { PHASE3_GUIDES };
