'use strict';
const { escapeHtml, slugify } = require('../lib/http-utils');
const seo = require('../lib/seo');
const { ctaBand, wheatDividerBand } = require('../lib/render');
const { productCard } = require('./home');

// Lightweight content hub. Each guide is original, general-purpose
// information about the products Mamta Bhoj makes. Rules followed here:
//  - general milling/cooking facts only, stated plainly and hedged where
//    practice varies between mills and kitchens;
//  - the only claims about Mamta Bhoj's own products are ones already
//    published on the site (product pages, Quality page, FAQs);
//  - no nutrition/health claims, prices, pack sizes, capacities or dates.
// Body strings are trusted, hand-written HTML (inline links only).

const MFR = (text) => `<a class="inline-link" href="${seo.MANUFACTURER_PATH}">${text}</a>`;
const PROD = (slug, text) => `<a class="inline-link" href="/products/${slug}">${text}</a>`;
const GUIDE = (slug, text) => `<a class="inline-link" href="/guides/${slug}">${text}</a>`;
const CONTACT = (text) => `<a class="inline-link" href="/contact">${text}</a>`;

const GUIDES = [
  {
    slug: 'maida-vs-atta',
    title: 'Maida vs Atta: Differences and Uses | Mamta Bhoj Guides',
    h1: "Maida vs Atta: What's the Difference and When Is Each Used?",
    shortTitle: 'Maida vs Atta',
    description:
      'A plain-language guide to maida (refined wheat flour) and atta (whole wheat flour): how each is made, how the dough behaves and which dishes suit each one.',
    cardText: 'How refined maida and whole wheat atta differ, and which one suits rotis, naan, bakery items and more.',
    intro:
      'Maida and atta both come from wheat, which is why they are often mixed up. What separates them is which parts of the wheat grain end up in the flour, and that choice shapes the colour, the texture and the dishes each flour suits.',
    products: ['fresh-chakki-atta', 'maida', 'tandoori-atta'],
    related: ['tandoori-atta-guide', 'how-flour-is-made'],
    sections: [
      {
        h2: 'What is atta?',
        body: [
          `Atta is the everyday flour of Indian kitchens. It is milled from the whole wheat grain, so the bran, the germ and the starchy endosperm all go into the flour. That is why atta is light brown and slightly coarser to the touch.`,
          `Atta has traditionally been ground on a stone chakki, which is where the name "chakki atta" comes from. ${PROD('fresh-chakki-atta', 'Mamta Bhoj Fresh Chakki Atta')} is milled in that traditional way and is meant for soft rotis, chapatis and parathas.`,
        ],
      },
      {
        h2: 'What is maida?',
        body: [
          `Maida is refined wheat flour. During milling the bran and germ are separated out and only the endosperm is ground, then sifted fine. The result is a soft, pale, very fine flour.`,
          `Because it has no bran to interrupt the dough, maida is the usual choice for bakery items and leavened breads. ${PROD('maida', 'Mamta Bhoj Maida')} is a finely refined wheat flour suited to naan, biscuits and everyday bakery-style cooking.`,
        ],
      },
      {
        h2: 'Maida and atta side by side',
        table: {
          head: ['', 'Atta', 'Maida'],
          rows: [
            ['Made from', 'The whole wheat grain: bran, germ and endosperm', 'The endosperm only, after bran and germ are removed'],
            ['Colour', 'Light brown', 'Creamy white to white'],
            ['Texture', 'Slightly coarser', 'Very fine and soft'],
            ['Dough', 'Soft and pliable; the bran makes it less stretchy', 'Smoother and more elastic'],
            ['Typical uses', 'Rotis, chapatis, parathas, puris', 'Naan, biscuits, cakes, bakery items, pastry'],
          ],
        },
      },
      {
        h2: 'How to choose between them',
        body: [
          `For daily rotis and parathas, atta is the standard choice. For breads and baked items that need a soft, light crumb or a stretchy dough, such as naan or biscuits, cooks reach for maida. Some recipes combine the two, so it is always worth following the recipe you are working from.`,
          `If you cook breads in a tandoor, there is a third option worth knowing about: a coarser atta made for that style of cooking. Our ${GUIDE('tandoori-atta-guide', 'guide to tandoori atta')} explains how it differs.`,
        ],
      },
      {
        h2: 'If you buy flour for a food business',
        body: [
          `Bakeries, caterers and restaurants usually care about two things: using the right flour for each product, and getting the same behaviour in the dough from one delivery to the next. When you enquire about bulk supply, it helps to say what you will make with the flour. You can read more about us as a ${MFR('flour manufacturer in Kanpur')} or ${CONTACT('send your requirement to our team')}.`,
        ],
      },
    ],
    faqs: [
      [
        'Is atta the same as whole wheat flour?',
        'In India, atta generally means whole wheat flour. Some packs are sifted to varying degrees, so check the label of the specific product.',
      ],
      [
        'Which has more fibre, atta or maida?',
        'Atta keeps the bran, so it contains more of the grain\'s fibre than maida, from which the bran is removed. For the nutritional values of a particular product, refer to the label on its pack.',
      ],
      [
        'Can I make rotis with maida?',
        'You can, but the taste and texture are different from rotis made with atta. Most households use atta for everyday rotis.',
      ],
      [
        'Is maida the same as all-purpose flour?',
        'They are similar, since both are refined wheat flours, but they are not identical. Fineness and protein content vary between mills and products.',
      ],
    ],
  },
  {
    slug: 'sooji-vs-rava',
    title: 'Sooji vs Rava: Understanding Semolina | Mamta Bhoj Guides',
    h1: 'Sooji vs Rava: Understanding Semolina for Everyday and Food-Business Use',
    shortTitle: 'Sooji vs Rava',
    description:
      'Sooji and rava are two names for semolina. Learn how grain size matters, what it is used for and what to look for at home or in a food business.',
    cardText: 'Two names, one product: what semolina is, why grain size matters and where it is used.',
    intro:
      'If you have ever wondered whether sooji and rava are different things, the short answer is no. They are two names for semolina, and which one you hear depends mostly on where you are in India.',
    products: ['sooji-rava', 'maida'],
    related: ['maida-vs-atta', 'how-flour-is-made'],
    sections: [
      {
        h2: 'The short answer',
        body: [
          `Sooji is the common name in much of north India. Rava (also written rawa or ravai) is the common name in the south and west. Both describe wheat milled into small, even granules rather than a fine powder.`,
          `${PROD('sooji-rava', 'Mamta Bhoj Sooji / Rava')} is listed under both names for exactly this reason. It is evenly milled semolina with a consistent grain size.`,
        ],
      },
      {
        h2: 'Why grain size matters',
        body: [
          `Where confusion does arise is in grain size. Some sellers and regions use different names, or different grades, for finer and coarser semolina. As a general rule, a finer grain tends to cook into a smoother texture, which suits halwa and batters, while a coarser grain keeps more distinct grains, which many cooks prefer in upma.`,
          `Whatever the grade, an even grain size helps the semolina cook at a steady rate, so the finished dish has a uniform texture.`,
        ],
      },
      {
        h2: 'Where sooji or rava is used',
        list: [
          'Upma, the everyday savoury breakfast dish',
          'Halwa and kesari, the sweet semolina dishes',
          'Rava dosa, rava idli and uttapam',
          'Snacks, fritters and some sweets and ladoos',
          'Coating or dusting in some kitchens',
        ],
      },
      {
        h2: 'Sooji is not maida',
        body: [
          `Both are milled from wheat, but they are different products. Sooji is granular, while maida is a fine powder, so they cook differently and are not interchangeable in a recipe. If you are unsure which one a recipe means, our ${GUIDE('maida-vs-atta', 'maida vs atta guide')} covers the powdered flours, and ${PROD('maida', 'Mamta Bhoj Maida')} is the refined flour in our range.`,
        ],
      },
      {
        h2: 'Cooking and storage notes',
        body: [
          `Many upma and halwa recipes call for roasting the semolina briefly before adding liquid; follow your own recipe, as practice varies. After opening a pack, keep it sealed and store it in a cool, dry place away from direct sunlight and moisture.`,
        ],
      },
      {
        h2: 'If you buy semolina for a food business',
        body: [
          `Canteens, caterers and snack makers cook at volume, so a consistent grain size from batch to batch matters for repeatable results. If you need a particular grade, say so when you enquire. You can learn more about us as a ${MFR('flour manufacturer in Kanpur')} or ${CONTACT('contact our team')} directly.`,
        ],
      },
    ],
    faqs: [
      ['Are sooji and rava the same thing?', 'Yes. Both are names for semolina, used in different regions of India.'],
      [
        'Is semolina the same as sooji?',
        'In everyday Indian usage, yes. In some other countries semolina is commonly made from durum wheat, so check the pack for the type of wheat used.',
      ],
      ['Can I use sooji in place of rava in a recipe?', 'Yes, as they are the same product. Pay attention to the grain size the recipe asks for.'],
      ['Is sooji the same as maida?', 'No. Sooji is granular semolina and maida is a fine refined flour, so they behave differently in cooking.'],
    ],
  },
  {
    slug: 'tandoori-atta-guide',
    title: 'Tandoori Atta Guide: How It Differs From Regular Atta | Mamta Bhoj',
    h1: 'What Is Tandoori Atta and How Is It Different From Regular Atta?',
    shortTitle: 'Tandoori Atta guide',
    description:
      'Tandoori atta is a coarser wheat flour made for tandoor-style rotis and thicker breads. See how it differs from everyday atta and how to use it.',
    cardText: 'What makes tandoori atta coarser than everyday atta, and when it is the better fit.',
    intro:
      'Walk into a restaurant kitchen that cooks in a tandoor and you will often find a different atta from the one used for home-style rotis. Tandoori atta is that flour: a coarser grind made with tandoor-style breads in mind.',
    products: ['tandoori-atta', 'fresh-chakki-atta'],
    related: ['maida-vs-atta', 'how-flour-is-made'],
    sections: [
      {
        h2: 'What is tandoori atta?',
        body: [
          `Tandoori atta is wheat flour milled coarser than everyday chakki atta. It is intended for tandoori rotis and other thicker breads rather than thin rotis cooked on a tawa.`,
          `${PROD('tandoori-atta', 'Mamta Bhoj Tandoori Atta')} is a coarser stone-ground wheat flour suited to tandoori rotis and thicker parathas. It uses the same natural, additive-free milling approach as our ${PROD('fresh-chakki-atta', 'Fresh Chakki Atta')}.`,
        ],
      },
      {
        h2: 'Tandoori atta vs regular atta',
        table: {
          head: ['', 'Regular chakki atta', 'Tandoori atta'],
          rows: [
            ['Grind', 'Finer', 'Coarser'],
            ['Typical use', 'Everyday soft rotis, chapatis, parathas', 'Tandoori roti, thicker parathas, restaurant-style breads'],
            ['Where it is common', 'Home kitchens and food service', 'Restaurants and kitchens that cook in a tandoor'],
          ],
        },
      },
      {
        h2: 'Why a coarser grind for the tandoor?',
        body: [
          `Tandoor breads are usually thicker than tawa rotis and are cooked quickly at high heat. Cooks often prefer a flour that gives a sturdier, slightly more rustic bite in that setting, and a coarser grind is one way to get it. Preferences differ from kitchen to kitchen.`,
        ],
      },
      {
        h2: 'Practical notes for using it',
        list: [
          'Flour absorbs water differently depending on its grind, so add water gradually rather than copying a ratio meant for finer atta.',
          'Let the dough rest before shaping; resting gives the flour time to take up the water.',
          'Follow the method of your own recipe, since tandoor temperature and bread style vary.',
        ],
      },
      {
        h2: 'For restaurants and caterers',
        body: [
          `Kitchens that cook tandoor breads every day need dough that behaves the same from one delivery to the next. If that is you, explain your requirement when you enquire. You can read more about us as a ${MFR('flour manufacturer in Kanpur')} or ${CONTACT('contact our team')} with your needs. For everyday rotis, the usual choice is ${PROD('fresh-chakki-atta', 'Chakki Atta')}, and the ${GUIDE('maida-vs-atta', 'maida vs atta guide')} explains how refined flour differs.`,
        ],
      },
    ],
    faqs: [
      [
        'Can I use regular atta for tandoori roti?',
        'Many people do. The texture will differ from a coarser tandoori atta, so it comes down to the result you want.',
      ],
      [
        'Can tandoori atta be used on a tawa?',
        'Mamta Bhoj Tandoori Atta is suited to tandoori rotis and thicker parathas. For everyday thin rotis, Chakki Atta is the usual choice.',
      ],
      [
        'Is tandoori atta the same as maida?',
        'No. Tandoori atta is a coarser wheat atta, while maida is a finely refined flour. Some restaurant recipes combine the two for certain breads, depending on the style.',
      ],
    ],
  },
  {
    slug: 'how-flour-is-made',
    title: 'How Wheat Flour Is Made: From Grain to Packaging | Mamta Bhoj',
    h1: 'How Wheat Flour Is Made: From Wheat Grain to Milling and Packaging',
    shortTitle: 'How flour is made',
    description:
      'How wheat becomes flour: cleaning, conditioning, grinding, sifting and packing, and how stone-ground chakki atta compares with refined flour.',
    cardText: 'The journey from wheat grain to packed flour, step by step, and how stone grinding fits in.',
    intro:
      'Flour looks simple, but a lot happens between a field of wheat and a sealed pack on the shelf. This guide walks through the usual steps, then shows how our own process at Chaubepur fits in.',
    products: ['fresh-chakki-atta', 'maida', 'besan'],
    related: ['maida-vs-atta', 'sooji-vs-rava'],
    sections: [
      {
        h2: 'The wheat grain in brief',
        body: [
          `A grain of wheat has three main parts. The bran is the outer layer, the germ is the small embryo, and the endosperm is the starchy inner part that makes up most of the grain. Which of these parts end up in the flour is what separates whole wheat atta from refined flour such as maida.`,
        ],
      },
      {
        h2: 'Step by step: from grain to flour',
        steps: [
          ['Receiving and checking', 'Wheat arrives at the mill and is checked for quality before it is accepted for milling.'],
          ['Cleaning', 'The grain is cleaned to remove stones, dust, husk and other foreign matter before it goes anywhere near the grinding stage.'],
          ['Conditioning', 'Mills commonly add a controlled amount of water and let the grain rest. This conditioning toughens the bran and makes the grain easier to mill cleanly.'],
          ['Grinding', 'The grain is ground. The method used here is the biggest difference between flours, and is covered in the next section.'],
          ['Sifting and grading', 'The ground material is sifted so that the flour is separated by fineness, and any coarse material is dealt with according to the product being made.'],
          ['Quality check', 'Samples are checked before the flour is cleared for packing.'],
          ['Packing and labelling', 'The flour is sealed in packs and labelled with product and batch details.'],
        ],
      },
      {
        h2: 'Stone grinding and roller milling',
        body: [
          `Two broad methods are used to grind wheat. In stone grinding, the whole grain is ground between stones, as a traditional chakki does. The flour that results keeps the bran and germ, which is how atta is made. In roller milling, a series of rollers and sieves separates the bran and germ from the endosperm, which is then milled finer. This is the usual route to refined flours.`,
          `Neither method is simply better; they make different products. Which one a particular pack came from, and how fine it is, varies between mills, so it is worth asking the maker if it matters to you.`,
        ],
      },
      {
        h2: 'How we mill at Chaubepur',
        body: [
          `At our unit in Chaubepur, Kanpur Nagar, our atta follows the traditional route: wheat is sourced and checked, cleaned, naturally stone-ground, quality-checked and packed in a hygienic setting. The ${seoLink('/quality', 'Quality & Process page')} shows each stage, and the ${seoLink('/certifications', 'certifications page')} lists our ISO 9001:2015 certificate and FSSAI licence. You can try ${PROD('fresh-chakki-atta', 'Fresh Chakki Atta')} as the clearest example, or read more about us as a ${MFR('flour manufacturer in Kanpur')}.`,
          `Not every flour starts as wheat. ${PROD('besan', 'Besan')} is gram flour, and ours is milled from cleaned chana dal, following the same logic of cleaning first, then milling and packing. For how a specific product in our range is milled, ${CONTACT('ask our team')}.`,
        ],
      },
    ],
    faqs: [
      [
        'What is the difference between chakki atta and other atta?',
        'It is mainly the grinding method. Chakki atta is ground between stones, while many commercial flours are produced on roller mills. The two can differ in texture and taste, and people have their preferences.',
      ],
      [
        'What is conditioning in flour milling?',
        'Conditioning (also called tempering) means adding a measured amount of water to the cleaned grain and letting it rest before grinding. It helps the bran separate cleanly and makes milling more consistent.',
      ],
      [
        'Why is flour sifted?',
        'Sifting separates the ground material by particle size, so that the finished flour has the fineness the product calls for.',
      ],
      [
        'Is all flour made from wheat?',
        'No. Besan is made from chana dal, and flours are also made from rice, maize and other grains and pulses.',
      ],
    ],
  },
];

function seoLink(href, text) {
  return `<a class="inline-link" href="${href}">${text}</a>`;
}

// Fail loudly at start-up if the sitemap's guide list and this file drift apart.
if (GUIDES.map((g) => g.slug).join() !== seo.GUIDE_SLUGS.join()) {
  throw new Error('views/guides.js GUIDES and lib/seo.js GUIDE_SLUGS are out of sync');
}

function findGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) || null;
}

function guidesForProduct(productSlug) {
  return GUIDES.filter((g) => g.products.includes(productSlug));
}

function arrowIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function tableHtml(t) {
  return `<div class="compare-wrap"><table class="compare">
    <thead><tr>${t.head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr><th scope="row">${escapeHtml(r[0])}</th>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function sectionHtml(s) {
  const parts = [`<h2>${escapeHtml(s.h2)}</h2>`];
  (s.body || []).forEach((p) => parts.push(`<p>${p}</p>`));
  if (s.list) parts.push(`<ul class="prose-list">${s.list.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>`);
  if (s.steps) parts.push(`<ol class="prose-steps">${s.steps.map(([t, d]) => `<li><strong>${escapeHtml(t)}.</strong> ${escapeHtml(d)}</li>`).join('')}</ol>`);
  if (s.table) parts.push(tableHtml(s.table));
  return parts.join('\n');
}

function faqHtml(faqs) {
  return faqs
    .map(([q, a]) => `<details class="faq-item"><summary>${escapeHtml(q)}${arrowIcon()}</summary><p>${escapeHtml(a)}</p></details>`)
    .join('');
}

function renderGuide(guide, products, content) {
  const bySlug = new Map(products.map((p) => [slugify(p.name), p]));
  const relatedProducts = guide.products.map((s) => bySlug.get(s)).filter(Boolean);
  const relatedGuides = guide.related.map(findGuide).filter(Boolean);
  return `
<section class="wrap" data-reveal>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a><span aria-hidden="true">/</span><a href="/guides">Guides</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(guide.shortTitle)}</span>
  </nav>
</section>
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Guide</span>
  <h1>${escapeHtml(guide.h1)}</h1>
  <p>${escapeHtml(guide.intro)}</p>
</section>
<article class="wrap" data-reveal><div class="prose">
  ${guide.sections.map(sectionHtml).join('\n')}
  <p class="note-small">General information about how these products are commonly made and used. Methods, grades and recipes vary between mills and kitchens.</p>
</div></article>

${wheatDividerBand()}

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Common Questions</span><h2>Frequently asked questions</h2></div>
  <div class="faq-list">${faqHtml(guide.faqs)}</div>
</section>

${
  relatedProducts.length
    ? `<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">From Our Range</span><h2>Mamta Bhoj products mentioned in this guide</h2></div>
  <div class="product-grid">${relatedProducts.map((p) => productCard(p)).join('')}</div>
</section>`
    : ''
}

<section class="wrap" data-reveal>
  <div class="section-head"><span class="eyebrow">Keep Reading</span><h2>More guides</h2></div>
  <ul class="guide-links">
    ${relatedGuides.map((g) => `<li><a href="/guides/${g.slug}">${escapeHtml(g.h1)}</a></li>`).join('')}
    <li><a href="/guides">All guides</a></li>
    <li><a href="${seo.MANUFACTURER_PATH}">About Devmam Flourish Foods, flour manufacturer in Kanpur</a></li>
  </ul>
</section>
${ctaBand(content)}
`;
}

function renderGuidesIndex(content) {
  return `
<section class="wrap" data-reveal>
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Guides</span></nav>
</section>
<section class="page-hero wrap" data-reveal>
  <span class="eyebrow">Guides</span>
  <h1>Flour guides from Mamta Bhoj</h1>
  <p>Short, practical explainers on atta, maida, sooji and how flour is made, for home cooks and food businesses.</p>
</section>
<section class="wrap" data-reveal>
  <div class="guide-grid">
    ${GUIDES.map(
      (g) => `<a href="/guides/${g.slug}" class="why-card guide-card" data-reveal-item>
      <h2>${escapeHtml(g.h1)}</h2>
      <p>${escapeHtml(g.cardText)}</p>
      <span class="know-more">Read the guide ${arrowIcon()}</span>
    </a>`
    ).join('')}
  </div>
  <p class="note-small" style="margin-top:1.6em;">Buying flour for a business? Read about us as a <a class="inline-link" href="${seo.MANUFACTURER_PATH}">flour manufacturer in Kanpur</a> or see the full <a class="inline-link" href="/products">Mamta Bhoj product range</a>.</p>
</section>
${ctaBand(content)}
`;
}

module.exports = { GUIDES, findGuide, guidesForProduct, renderGuide, renderGuidesIndex };
