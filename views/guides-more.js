'use strict';
const { PRODLINK, GUIDELINK, MFRLINK, CONTACTLINK, B2BLINK, LINK } = require('./links');

// Phase-2 guides. Same rules as views/guides.js: general milling and cooking
// facts only (hedged where practice varies), claims about Mamta Bhoj limited to
// what the site already publishes, no nutrition or health claims, no prices,
// MOQ, delivery promises, certifications beyond ISO 9001:2015 / FSSAI, and no
// dates. Body strings are trusted, hand-written HTML (inline links only).
// A section may carry `subs` (H3 subsections) for a logical H2/H3 hierarchy.

const MORE_GUIDES = [
  // ------------------------------------------------------------------
  {
    slug: 'chakki-atta-vs-roller-milled-atta',
    title: 'Chakki Atta vs Roller-Milled Atta: What Differs | Mamta Bhoj',
    h1: 'Chakki Atta vs Roller-Milled Atta: How the Two Are Made and How They Differ',
    shortTitle: 'Chakki vs roller-milled atta',
    description:
      'How stone-ground chakki atta and roller-milled atta are made, how they differ in texture and dough, and what to check on a pack before you buy.',
    cardText: 'Stone grinding and roller milling explained side by side, and what to read on an atta pack.',
    intro:
      'Two kinds of atta sit side by side on most shelves: chakki atta, ground between stones, and atta made on modern roller mills. Both are wheat flour for rotis. The difference is in how the grain is ground, and this guide explains both methods in plain terms so you can read a pack, choose for your kitchen and ask a supplier better questions.',
    products: ['fresh-chakki-atta', 'tandoori-atta'],
    related: ['how-flour-is-made', 'tandoori-atta-guide', 'maida-vs-atta'],
    business: ['institutional-flour-supplier', 'wholesale-flour-supplier'],
    sections: [
      {
        h2: 'Same grain, two grinding methods',
        body: [
          `Atta is the wheat flour used mainly for rotis, chapatis and parathas. Whatever it is called on the pack, the wheat starts out in much the same way: it is received, checked, cleaned and conditioned before grinding. The step that differs is the grinding itself, and that is where stone grinding and roller milling part ways.`,
        ],
      },
      {
        h2: 'How chakki (stone) grinding works',
        subs: [
          {
            h3: 'The process',
            body: [
              `In a chakki, the grain is crushed and ground between two stones. The whole grain goes in together, so the bran, the germ and the endosperm are ground into a single flour rather than separated first. It is the method behind the traditional home chakki, scaled up for a mill.`,
              `The details, such as the type of stone, how fast it turns and how the flour is sifted afterwards, vary from mill to mill.`,
            ],
          },
          {
            h3: 'What it tends to look and feel like',
            body: [
              `Stone-ground atta usually looks a little more rustic: a slightly coarser, lightly speckled flour with a warm light-brown colour that comes from the bran being ground in. Many cooks associate that texture with home-style rotis.`,
            ],
          },
        ],
      },
      {
        h2: 'How roller milling works',
        subs: [
          {
            h3: 'The process',
            body: [
              `A roller mill passes the grain through a series of paired rollers and sieves. The early stages break the grain open and separate the bran and germ from the endosperm, and later stages reduce the endosperm to flour. Because the parts of the grain are separated along the way, a roller mill can produce refined flour such as maida and semolina, and in some mills whole wheat atta made by bringing the separated parts back together.`,
            ],
          },
          {
            h3: 'What it tends to look and feel like',
            body: [
              `Roller-milled flour is typically finer and more uniform in particle size. Bakeries and large kitchens often value that uniformity because it makes results easier to predict.`,
            ],
          },
        ],
      },
      {
        h2: 'Chakki atta and roller-milled atta side by side',
        table: {
          head: ['', 'Chakki (stone-ground) atta', 'Roller-milled atta'],
          rows: [
            ['Grinding action', 'Grain ground between stones, all parts together', 'Grain broken and reduced by rollers and sieves in stages'],
            ['Typical texture', 'Slightly coarser and more rustic', 'Finer and more uniform'],
            ['Typical colour', 'Light brown, often lightly speckled', 'Varies with how much bran is included'],
            ['Dough', 'Many cooks find it soft and easy to work for home-style rotis', 'Behaviour varies by mill and grade'],
            ['Where you meet it', 'Home kitchens, food service and traditional-style brands', 'Packaged atta from many brands, and bakery supply'],
          ],
        },
      },
      {
        h2: 'Which one is better?',
        body: [
          `Neither is automatically better. They are different products that suit different preferences. What matters more than the milling method is whether the pack is genuinely whole wheat, how consistent the flour is from one batch to the next, and how it is packed and labelled. The word "atta" on its own does not tell you how much of the grain is in the flour, so the ingredient list and product name are worth reading.`,
        ],
        subs: [
          {
            h3: 'What to check on an atta pack',
            list: [
              'Whether it says 100% whole wheat',
              'The milling method, if the brand states it',
              'Batch and packing details, and the best-before date',
              'The licence number printed on the label',
              'The nutrition information, if you are comparing brands',
            ],
          },
        ],
      },
      {
        h2: 'Where Mamta Bhoj fits',
        body: [
          `At our unit in Kanpur, Uttar Pradesh, our atta follows the chakki route: wheat is sourced and checked, cleaned, naturally stone-ground and then packed. ${PRODLINK('fresh-chakki-atta', 'Mamta Bhoj Fresh Chakki Atta')} is 100% whole wheat and is made for everyday rotis, chapatis and parathas. ${PRODLINK('tandoori-atta', 'Tandoori Atta')} uses the same stone-ground approach with a coarser grind for tandoor-style breads.`,
          `Our guide to ${GUIDELINK('how-flour-is-made', 'how wheat flour is made')} covers the whole journey from grain to pack, and the ${LINK('/quality', 'Quality &amp; Process page')} shows each stage at our unit. If you are comparing atta for a restaurant, canteen or retail shelf, you can read about ${B2BLINK('institutional-flour-supplier', 'supply for kitchens and bakeries')} or ${B2BLINK('wholesale-flour-supplier', 'wholesale supply for dealers and retailers')}, or ${CONTACTLINK('send us your requirement')}. As the ${MFRLINK('flour manufacturer behind the Mamta Bhoj range')}, we are happy to explain how a particular product is milled.`,
        ],
      },
    ],
    faqs: [
      [
        'Is chakki atta the same as whole wheat atta?',
        'Traditionally, yes: stone grinding the whole grain gives a whole wheat flour. Because "atta" is used loosely, check the label to confirm that a particular pack is 100% whole wheat. Mamta Bhoj Fresh Chakki Atta is described as 100% whole wheat.',
      ],
      [
        'Can roller-milled atta be whole wheat?',
        'Yes. Roller mills can produce whole wheat atta, for example by combining the separated parts of the grain again, and they also produce refined flour. The pack should make clear which one you are buying.',
      ],
      [
        'Does stone-ground atta need more water for dough?',
        'Flours absorb water differently depending on the grind and how much bran they contain. Add water gradually and let the dough rest, rather than relying on a fixed ratio.',
      ],
      [
        'Why is chakki atta sometimes darker or coarser?',
        'Because the whole grain is ground together, the bran is part of the flour. It gives the flour its colour and a slightly coarser feel.',
      ],
      [
        'Which should a restaurant or caterer choose?',
        'It depends on the bread you make. Many kitchens decide by result: how the roti or bread turns out, how the dough handles at volume, and how consistent it is between deliveries. Discussing your needs with the supplier is more useful than relying on the milling method alone.',
      ],
    ],
  },

  // ------------------------------------------------------------------
  {
    slug: 'what-is-maida',
    title: 'What Is Maida? Meaning, Uses and Buying Tips | Mamta Bhoj',
    h1: 'What Is Maida? A Practical Guide to Refined Wheat Flour',
    shortTitle: 'What is maida',
    description:
      'What maida is, how refined wheat flour is made, where it is used in bakeries and kitchens, and what to look for when you buy it for a home or a business.',
    cardText: 'What maida is, how it is made, where it is used and what to look for when buying it.',
    intro:
      'Maida is one of the most widely used flours in Indian kitchens and bakeries, yet it is often described only by what it is not: it is not atta. This guide explains what maida actually is, how it is made, what gives it its character and where it is used, with notes for anyone buying it for a business.',
    products: ['maida', 'fresh-chakki-atta'],
    related: ['maida-vs-atta', 'how-flour-is-made', 'how-to-choose-flour-supplier'],
    business: ['institutional-flour-supplier', 'bulk-flour-supplier-india'],
    sections: [
      {
        h2: 'Maida in a nutshell',
        body: [
          `Maida is refined wheat flour: wheat that has been milled so that only the starchy inner part of the grain, the endosperm, is ground into flour, then sifted until it is very fine. The result is a soft, pale flour with a mild taste. It is the standard flour for naan and other leavened breads, biscuits, cakes and many fried snacks.`,
          `If you are looking for the contrast with whole wheat atta, our guide to ${GUIDELINK('maida-vs-atta', 'maida vs atta')} sets the two side by side. This guide stays with maida itself.`,
        ],
      },
      {
        h2: 'How maida is made',
        body: [
          `The route from grain to maida follows the same early steps as other wheat flours: the wheat is received and checked, cleaned to remove stones, dust and husk, and conditioned so the grain mills cleanly. Then the milling stage separates the parts of the grain and the endosperm is reduced to fine flour. Sifting grades the flour by fineness before it is packed and labelled.`,
        ],
        subs: [
          {
            h3: 'Why the bran and germ are separated',
            body: [
              `The bran is the outer layer of the grain and the germ is its small embryo. Both are removed during milling so that the flour is fine and pale, and so that the dough is smooth and stretchy. The trade-off is that the finished flour no longer contains what those parts of the grain would have added, which is why maida and whole wheat atta behave and taste differently.`,
            ],
          },
        ],
      },
      {
        h2: 'What gives maida its character',
        subs: [
          {
            h3: 'Fineness',
            body: [`Maida is milled much finer than atta, which is why it feels silky between the fingers and gives a smooth crumb in baked goods.`],
          },
          {
            h3: 'Colour and taste',
            body: [`With the bran removed, the flour is creamy white to white and its flavour is mild, so it lets other ingredients come through.`],
          },
          {
            h3: 'Gluten and dough',
            body: [
              `Wheat flour contains proteins that form gluten when mixed with water and worked. In maida dough the gluten network is not interrupted by bran, so the dough is typically smooth, elastic and easy to stretch. That is what lets leavened dough trap gas and rise, and what makes it possible to roll pastry thin.`,
            ],
          },
        ],
      },
      {
        h2: 'Where maida is used',
        subs: [
          {
            h3: 'Breads and naan',
            body: [`Naan, kulcha, bread and buns rely on the stretch and softness that maida dough gives. Restaurant kitchens and bakeries use it for these breads every day.`],
          },
          {
            h3: 'Biscuits, cakes and bakery items',
            body: [`Biscuits, cakes, rusks and many other baked items use maida for a fine, even texture.`],
          },
          {
            h3: 'Snacks and pastry',
            body: [`Samosa and kachori pastry, mathri and other fried snacks are commonly made with maida because it rolls out thin and fries crisp.`],
          },
          {
            h3: 'Everyday cooking',
            body: [`Cooks also use a spoonful of maida to thicken sauces and gravies, or in batters and coatings.`],
          },
        ],
      },
      {
        h2: 'Buying maida for a business',
        body: [
          `For a bakery, sweet shop or restaurant, the useful questions about maida are practical ones. Is the fineness the same from delivery to delivery? Is the pack sealed and clearly labelled with batch and licence details? Does the supplier explain how the flour is milled and checked? Our ${GUIDELINK('how-to-choose-flour-supplier', 'checklist for choosing a flour supplier')} turns these into questions you can ask.`,
          `${PRODLINK('maida', 'Mamta Bhoj Maida')} is a finely refined wheat flour made for naan, bakery items and everyday Indian cooking, available in 1 kg, 2 kg and 5 kg packs. If you buy for a bakery or kitchen, read about ${B2BLINK('institutional-flour-supplier', 'supply for kitchens and bakeries')} or ${B2BLINK('bulk-flour-supplier-india', 'bulk flour supply')}, then ${CONTACTLINK('send us your requirement', 'Wholesale / Bulk Purchase')}. Our unit in Kanpur is described on the ${MFRLINK('flour manufacturer page')}.`,
        ],
      },
      {
        h2: 'Storing maida',
        body: [
          `Like any flour, maida keeps best sealed, dry and cool. After opening a pack, close it again or move the flour to a clean, dry, airtight container, and keep it away from direct sunlight, moisture and strong-smelling items. Follow the best-before date on the pack; we do not state a general shelf life here because it depends on the batch.`,
        ],
      },
    ],
    faqs: [
      [
        'Is maida the same as plain flour or all-purpose flour?',
        'They are close relatives, since all are refined wheat flours, but they are not identical. Fineness and protein content differ between mills and products, so results can vary from one flour to another.',
      ],
      [
        'Does maida contain gluten?',
        'Yes. Maida is made from wheat, so it contains wheat gluten. That gluten is what gives maida dough its stretch.',
      ],
      [
        'Why is maida white?',
        'Because the bran and germ are removed during milling and only the endosperm is ground, the flour is pale and fine.',
      ],
      [
        'Can I use maida instead of atta for rotis?',
        'You can, but the texture and flavour will differ from rotis made with atta. Most households use atta for everyday rotis and keep maida for bakery items and naan.',
      ],
      [
        'How long can maida be stored?',
        'Check the best-before date printed on the pack. Storing the flour sealed, dry and cool helps it keep well, but shelf life depends on the batch, so follow the label.',
      ],
    ],
  },

  // ------------------------------------------------------------------
  {
    slug: 'what-is-besan',
    title: 'What Is Besan? Gram Flour Uses and Buying Guide | Mamta Bhoj',
    h1: 'What Is Besan? Gram Flour Explained',
    shortTitle: 'What is besan',
    description:
      'Besan is flour made from chana dal. Learn how it is made, how it differs from chickpea flour, what it is used for and how to buy and store it.',
    cardText: 'Gram flour explained: how besan is made, what it is used for, and how to buy and store it.',
    intro:
      'Besan turns up in pakoras, kadhi, chilla and some of India’s best-loved sweets, but it is not made from wheat at all. This guide explains what besan is, how it is milled, how it differs from chickpea flour, and what to think about when you buy it for a home kitchen, a sweet shop or a snack business.',
    products: ['besan', 'sooji-rava'],
    related: ['how-flour-is-made', 'how-to-choose-flour-supplier', 'sooji-vs-rava'],
    business: ['wholesale-flour-supplier', 'bulk-flour-supplier-india'],
    sections: [
      {
        h2: 'What besan is',
        body: [
          `Besan, also called gram flour, is a flour milled from chana dal, which is split and husked Bengal gram. It is pale yellow, finely powdered and has a distinctive, slightly nutty flavour. Because it comes from a pulse rather than wheat, it behaves very differently from atta or maida: it does not form a stretchy dough, but it makes thick, smooth batters that bind and set when cooked.`,
        ],
      },
      {
        h2: 'How besan is made',
        body: [
          `Production begins with the chana dal being cleaned to remove dust, stones and other foreign matter. The cleaned dal is then milled to a fine powder and sifted to the desired fineness before it is packed.`,
          `${PRODLINK('besan', 'Mamta Bhoj Besan')} is finely milled from cleaned chana dal. Our wider process, from cleaning to packing, is described in the guide to ${GUIDELINK('how-flour-is-made', 'how flour is made')}.`,
        ],
        subs: [
          {
            h3: 'Raw and roasted besan',
            body: [
              `Most besan sold for everyday cooking is milled from raw dal. Some recipes, especially for certain sweets, call for besan that has been roasted, either before milling or by dry-roasting the flour in the pan at home. Roasting changes the aroma and tames the raw taste of the flour.`,
            ],
          },
        ],
      },
      {
        h2: 'Besan and chickpea flour',
        body: [
          `In English-language recipes besan is often called chickpea flour or gram flour. They are close cousins, but the grain used can differ: besan is traditionally made from split Bengal gram, while chickpea flour sold elsewhere is often made from other types of chickpea. If a recipe depends on the exact flavour, check the label of the flour you are using.`,
        ],
      },
      {
        h2: 'What besan is used for',
        subs: [
          {
            h3: 'Savoury dishes',
            body: [`Pakoras and bhajias, kadhi, chilla, dhokla and gatte are all built on besan. It gives batters body and a golden finish when fried or steamed.`],
          },
          {
            h3: 'Batters and coatings',
            body: [`A besan batter clings well to vegetables and snacks, which is why it is the base for so many fried street foods.`],
          },
          {
            h3: 'Sweets',
            body: [`Besan ladoo, barfi and mysore pak all start with besan roasted slowly in ghee until it smells nutty. Sweet shops buy besan in volume for this reason.`],
          },
        ],
      },
      {
        h2: 'Cooking tips that apply to any besan',
        list: [
          'Sift the flour before use; it clumps easily.',
          'Add water or curd gradually and whisk in one direction for a smooth batter.',
          'Let a batter rest for a short while so the flour hydrates fully.',
          'Roast sweet-making besan on a gentle heat and stir continuously so it does not catch.',
        ],
      },
      {
        h2: 'Buying besan for a kitchen or a business',
        body: [
          `Fineness is the first thing to look at, because it decides how smooth a batter or a sweet turns out. The second is a clean, pleasant smell: pulse flours that smell musty or bitter are best avoided. Then check the label for batch and packing details and the best-before date, and, if you buy regularly, ask whether the texture stays consistent from one delivery to the next.`,
          `Mamta Bhoj Besan is available in 1 kg, 2 kg and 5 kg packs. Sweet shops, snack makers and caterers who buy regularly can read about ${B2BLINK('wholesale-flour-supplier', 'wholesale supply')} and ${B2BLINK('bulk-flour-supplier-india', 'bulk flour supply')}, or ${CONTACTLINK('contact our team', 'Wholesale / Bulk Purchase')}. The ${MFRLINK('mill that makes it')} is in Kanpur, Uttar Pradesh.`,
        ],
      },
      {
        h2: 'Storing besan',
        body: [
          `Keep besan sealed in a cool, dry place away from direct sunlight and moisture, and use a clean, dry spoon each time. Follow the best-before date on the pack.`,
        ],
      },
    ],
    faqs: [
      ['Is besan the same as gram flour?', 'Yes. Besan is the Indian name for gram flour, made from chana dal.'],
      [
        'Is besan made from wheat?',
        'No. Besan is milled from chana dal, which is a pulse. That is why it behaves differently from atta and maida.',
      ],
      [
        'Can I use besan instead of maida?',
        'Not as a like-for-like swap. Besan makes batters that bind and set, while maida forms a stretchy dough, so recipes written for one rarely work with the other.',
      ],
      [
        'Why does my besan batter taste raw or bitter?',
        'Raw besan has a strong flavour that cooking mellows. Giving the batter time to rest, cooking it fully, or lightly roasting the flour first for certain recipes can help.',
      ],
      [
        'How do I stop besan from forming lumps?',
        'Sift it first, add the liquid a little at a time, and whisk steadily in one direction until the batter is smooth.',
      ],
    ],
  },

  // ------------------------------------------------------------------
  {
    slug: 'how-to-choose-flour-supplier',
    title: 'How to Choose a Flour Supplier: Checklist | Mamta Bhoj',
    h1: 'How to Choose a Flour Supplier for Your Business',
    shortTitle: 'Choosing a flour supplier',
    description:
      'A practical checklist for bakeries, caterers and retailers choosing a flour supplier: documents to check, consistency, packaging, samples and questions to ask.',
    cardText: 'A buyer’s checklist: the documents, questions and checks that matter when choosing a flour supplier.',
    intro:
      'Flour looks like a simple purchase until a batch behaves differently from the last one. Whether you run a bakery, a canteen, a sweet shop or a retail counter, choosing a supplier well saves time later. This guide sets out what to check, what to ask, and how to compare offers fairly. It applies to any supplier, including us.',
    products: ['fresh-chakki-atta', 'maida', 'besan'],
    related: ['how-flour-is-made', 'chakki-atta-vs-roller-milled-atta', 'what-is-maida'],
    business: ['bulk-flour-supplier-india', 'wholesale-flour-supplier', 'institutional-flour-supplier', 'supply-distribution-india'],
    sections: [
      {
        h2: 'Start with what you actually need',
        body: [
          `Before you contact anyone, write down the flour you use, what it is used for, the pack size you can handle and roughly how much you use each month. A tandoor kitchen, a biscuit maker and a retail counter all need different things. If you know your product list, a supplier can answer you precisely instead of generally.`,
        ],
      },
      {
        h2: 'Check the paperwork',
        body: [`Any food supplier should be comfortable showing you its documents. Three are worth looking at.`],
        subs: [
          {
            h3: 'FSSAI licence',
            body: [
              `Ask for the licence number and a copy of the licence, and check that it is current and that the premises on it match where the flour is made. The number can be checked against FSSAI’s official records.`,
            ],
          },
          {
            h3: 'ISO certificate',
            body: [
              `An ISO 9001 certificate relates to a quality management system, not to the quality of any single product. Look at its scope, its validity dates and the certification body that issued it; the certificate itself usually explains how it can be verified.`,
            ],
          },
          {
            h3: 'Pack labelling',
            body: [`A professional pack carries batch and packing details, a best-before date and the licence number. Without batch details, it is hard to trace a problem back to its source.`],
          },
        ],
      },
      {
        h2: 'Judge consistency, not one good sample',
        body: [
          `A single good sample tells you very little. What matters for a kitchen or a bakery is whether the second and tenth deliveries behave like the first: the same fineness, the same colour, the same water absorption, the same finished bread. If you can, test with a small first order and keep notes before committing to volume.`,
        ],
      },
      {
        h2: 'Ask how the flour is made and handled',
        body: [
          `A supplier who runs their own mill can describe the steps: how the grain is checked, cleaned and conditioned, how it is milled, how the flour is checked and how it is packed. Our guide to ${GUIDELINK('how-flour-is-made', 'how wheat flour is made')} lists the steps, and the difference between stone-ground and roller-milled flour is covered in ${GUIDELINK('chakki-atta-vs-roller-milled-atta', 'chakki atta vs roller-milled atta')}.`,
        ],
      },
      {
        h2: 'Questions to ask every supplier',
        table: {
          head: ['Topic', 'What to ask'],
          rows: [
            ['Products and grades', 'Exactly which flour, in which grade, and how is it described on the pack?'],
            ['Pack sizes', 'Which pack sizes are available, and can other formats be arranged?'],
            ['Commercial terms', 'How is pricing quoted, and are there minimum order quantities or payment terms?'],
            ['Delivery', 'Do you deliver to my location, and how long does it usually take?'],
            ['Samples', 'Can I try the flour before placing a regular order?'],
            ['Traceability', 'Are batch details printed on each pack?'],
            ['Problems', 'What happens if a batch does not perform as expected?'],
          ],
        },
      },
      {
        h2: 'Comparing offers fairly',
        body: [
          `Two quotes are only comparable when the product, the pack size and the delivery terms are the same. A lower price for a different grade, a larger pack or a longer delivery time is not a like-for-like saving. Compare the whole arrangement, including payment terms and how problems are handled, not just the rate per kilogram.`,
        ],
      },
      {
        h2: 'Warning signs',
        list: [
          'Reluctance to share a licence number or certificate',
          'No batch or packing details on the pack',
          'Vague answers about where and how the flour is made',
          'Promises that sound too good to be true, such as the lowest price with no conditions',
        ],
      },
      {
        h2: 'How Devmam Flourish Foods approaches this',
        body: [
          `We mill and pack the Mamta Bhoj range at our own unit in Kanpur, Uttar Pradesh. Our ISO 9001:2015 certificate and FSSAI State Licence are available to view on the ${LINK('/certifications', 'certifications page')}, and the ${LINK('/quality', 'Quality &amp; Process page')} shows how the flour is made and checked. All five products are available in 1 kg, 2 kg and 5 kg packs.`,
          `We do not publish prices, minimum quantities or delivery timelines, because they depend on the product and on your location and requirement; we discuss them directly. Ask us about samples as part of your enquiry. To see how we work with different buyers, read about ${B2BLINK('bulk-flour-supplier-india', 'bulk supply')}, ${B2BLINK('wholesale-flour-supplier', 'wholesale supply')}, ${B2BLINK('institutional-flour-supplier', 'supply for kitchens')} and ${B2BLINK('supply-distribution-india', 'supply and distribution enquiries from across India')}, or learn more about us as a ${MFRLINK('flour manufacturer in Kanpur')} and ${CONTACTLINK('get in touch')}.`,
        ],
      },
    ],
    faqs: [
      [
        'How do I verify a supplier’s FSSAI licence?',
        'Ask for the licence number and a copy of the licence, then check the number against FSSAI’s official records. Make sure the licence is current and that the premises named on it match where the food is made.',
      ],
      [
        'Does ISO 9001 certification guarantee product quality?',
        'No. ISO 9001 certifies a quality management system. It shows that a business follows defined processes, but it is not a guarantee about any single batch of product.',
      ],
      [
        'Should I buy from a manufacturer or a trader?',
        'Both can work. A manufacturer can usually explain how the flour is made and checked, while a trader may offer a wider mix of brands. Whichever you choose, ask for the same documents and the same answers.',
      ],
      [
        'Should I test a small order first?',
        'Yes. A small first order lets you compare the flour against your current one in your own recipes before you commit to volume.',
      ],
      [
        'Is it wise to have more than one supplier?',
        'Many businesses keep a second source as a back-up. It is worth qualifying it in the same way as your main supplier.',
      ],
    ],
  },
];

module.exports = { MORE_GUIDES };
