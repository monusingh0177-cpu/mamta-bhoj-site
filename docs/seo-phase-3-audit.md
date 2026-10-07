# SEO Phase 3 audit: Mamta Bhoj (devmamflourishfoods.com)

Baseline: `main` at `44eed97` (SEO Phase 1 and Phase 2 already in place). Nothing from Phases 1 and 2 was redone or undone.

## Method and limits

- Read the whole codebase (server, routes, views, helpers, CSS, data shape) and crawled every public route of the app running locally: 26 sitemap URLs, every internal link, headers, metadata, headings, images, JSON-LD, link graph.
- **The live site could not be inspected.** The sandbox has no route to `https://devmamflourishfoods.com` (the proxy answers 403). Production-only items (HTTP to HTTPS, www DNS, TLS, any proxy-level compression, HSTS) are marked "unverified" and are covered by `scripts/seo-health-check.sh` when run against the live URL.
- Owner-confirmed facts used as authoritative: Kanpur factory; five products, each in 1 kg, 2 kg and 5 kg; Chakki Atta High Protein claim approved and its fibre-and-protein claim lab verified (stated as a claim only, with no certificate, lab name or figures); PAN-India supply is the intended direction (written as "enquiries welcome from across India, supply confirmed per location"). No Delhi/NCR/Ghaziabad presence, prices, MOQ, delivery promises, reviews, ratings, offers or extra certifications were added anywhere.

## Baseline measurements (before Phase 3)

| Item | Before |
|---|---|
| Sitemap URLs / non-200 / orphans | 26 / 0 / 0 |
| Home page HTML, CSS (uncompressed over the wire) | 74 KB, 54 KB (no gzip) |
| `<img>` without width/height | home 14 of 17, product pages 5 of 7, guides 2 to 3 |
| Titles over 60 characters | 10 pages |
| Pages with BreadcrumbList schema | B2B, guides, products only (not /products, /about, /quality, /faq, /certifications, /contact) |
| Heading outline | footer and card headings were `h4` directly under `h2` on every page |
| 404 page | bare page with no navigation |
| Inbound links (all pages) to /supply-distribution-india, /guides/sooji-vs-rava | 6, 4 |

## Findings, priority and status

Priority: **C**ritical, **H**igh, **M**edium, **L**ow. No critical issues were found: every route returned 200, canonicals/sitemap/robots/redirects/HEAD/trailing-slash behaved correctly.

| # | Pri | Finding | Files / routes | Status |
|---|---|---|---|---|
| 1 | H | No HTTP compression for HTML, CSS, JS, sitemap (74 KB home HTML, 54 KB CSS) | `server.js` | **Done**: gzip with `Vary: Accept-Encoding` (home HTML 74 KB to 11 KB, CSS 54 KB to 12.6 KB) |
| 2 | H | No page targeted "flour/atta/maida/besan/sooji manufacturer India" intent; the Kanpur page covers the local entity only | new `/flour-manufacturer-india`, `views/b2b-pages.js`, `lib/seo.js`, `views/links.js` | **Done**: one product-by-product page (no doorway pages) |
| 3 | H | Hub-and-spoke gaps: B2B and guides not in the header; guides had no contextual B2B/manufacturer links in the body; some pages had few inbound links | `lib/render.js`, `views/guides.js`, `views/products.js`, `views/home.js`, `views/contact.js`, `views/product-*.js` | **Done** (see Internal linking) |
| 4 | H | Images without width/height (layout shift risk) | new `lib/image-dims.js`, `views/home.js`, `views/product-detail.js`, `views/quality.js`, `public/css/style.css` | **Done**: 0 images missing dimensions; measured CLS 0.0000 |
| 5 | H | Homepage title and meta omitted Besan and Tandoori Atta; footer and About text the same | `routes/public.js`, `lib/render.js`, `views/about.js` | **Done** |
| 6 | M | Titles over 60 characters on 10 pages (SERP truncation) | `routes/public.js`, `views/product-detail.js`, `views/b2b-pages.js`, `views/guides*.js` | **Done**: all 31 titles are 60 characters or fewer, all descriptions 70 to 160 |
| 7 | M | Thin topical coverage: no guides on choosing atta, flour types, storage or planning a bulk order (restaurant/bakery flour selection is already covered by the institutional supply page) | four new guides (below) | **Done** |
| 8 | M | BreadcrumbList schema and visible breadcrumbs missing on six top-level pages | `lib/render.js` (`breadcrumbNav`), `routes/public.js` | **Done**: same items drive markup and schema |
| 9 | M | Heading outline skipped levels (`h2` to `h4`) on every page; `/products` and `/contact` had no `h2` | `lib/render.js`, `views/about.js`, `views/quality.js`, `views/home.js`, `views/products.js`, `views/contact.js`, CSS | **Done**: no skipped levels on any page |
| 10 | M | Product pages: no scannable facts; Product schema had no `manufacturer` | `views/product-detail.js`, `views/product-content.js`, `lib/seo.js` | **Done**: "At a glance" table of existing facts; `manufacturer` points at the Organization |
| 11 | M | /products was thin (about 245 words) | `views/products.js` | **Done**: "which flour for which job" table plus guide and B2B links |
| 12 | M | FAQ page told visitors to pick "Bulk / Wholesale Order"; the form option is "Wholesale / Bulk Purchase" | `views/faq.js` | **Done** |
| 13 | M | Chakki Atta fibre-and-protein wording needed the owner-confirmed lab-verified claim | `views/product-content.js`, `views/product-detail.js`, `/flour-manufacturer-india` | **Done** (claim only; the health check now restricts "lab verified" to these two pages and to that claim) |
| 14 | M | Static caching: CSS/JS are fingerprinted but cached only one day; no ETag/Last-Modified | `server.js` | **Done**: fingerprinted CSS/JS `max-age=31536000, immutable`; images 7 days; ETag + 304 |
| 15 | M | 404 page was a bare, link-less page | `server.js`, `routes/public.js` (`renderNotFound`) | **Done**: branded, still a real 404 and `noindex` |
| 16 | M | Eight menu items would wrap at tablet widths | `public/css/style.css` | **Done**: nowrap, tightened bar below 1100px, menu button below 980px |
| 17 | L | Sitemap has no `<lastmod>` | `lib/seo.js` | Deferred: no reliable per-page modification dates exist; adding made-up dates would mislead |
| 18 | L | Guides carry no `datePublished`/`dateModified` | `lib/seo.js` | Deferred: no recorded dates (owner decision) |
| 19 | L | Large hero-style JPEGs (facility 649 KB, quality 621 KB) could be WebP/AVIF | `public/images/*` | Deferred: approved artwork must not be re-encoded without sign-off (Phase 3B) |
| 20 | L | Google Fonts stylesheet is render-blocking | `lib/render.js` | Deferred: needs real-device testing to avoid a flash of unstyled text |
| 21 | L | `public/images/mamta-bhoj-favicon.png` is not referenced anywhere | assets | Left in place (harmless; deleting assets is out of scope) |
| 22 | L | `sameAs` (Google Business Profile, social URLs) absent from Organization schema | `lib/seo.js` | Deferred: needs the real profile URLs (owner decision) |

Unverified (production only): HTTP to HTTPS redirect, www DNS, TLS, HSTS, any proxy-level compression.

## New routes

- `/flour-manufacturer-india` and the four guides above: five new routes, 31 sitemap URLs in total (26 before). `/flour-manufacturer-india` (added to the sitemap and to a new "For Businesses" header and footer link). Distinct job from `/flour-manufacturer-kanpur`: that page is the local entity page (who we are, where, certifications); this one is a product-by-product overview (`#atta`, `#maida`, `#sooji`, `#besan` sections) plus a checklist for evaluating a flour manufacturer and links to the four supply pages. It makes no supply-to-location promise.

## New guides (genuine search intent, general information only)

A fifth guide, "which flour for restaurants, bakeries and caterers", was dropped in the final review: its table and advice duplicated the existing `/institutional-flour-supplier` page and would have competed with it.

`how-to-choose-atta`, `types-of-flour-in-india`, `how-to-store-flour`, `bulk-flour-procurement-guide` (which plans the order and points to the existing supplier checklist instead of repeating it). Each has a visible FAQ matched by FAQPage schema, an Article schema, breadcrumbs, product cards, and a "Buying flour for a business?" panel.

## Internal linking (Homepage to Manufacturer to B2B to Products to Guides to Enquiry)

- Header: Guides and For Businesses added; footer: new "For Businesses" and "Flour Guides" lists.
- Home: manufacturer (Kanpur and India), all five supply cards, six guides.
- Products: "which flour for which job" table, guides, supply pages, both manufacturer pages.
- Product pages: guide(s), supply page(s) with varied anchors (including `#atta`, `#maida`, `#sooji`, `#besan` on the India page), manufacturer page, direct enquiry link.
- Guides: product cards, "For Businesses" panel (varied anchor text per guide), related guides, manufacturer page.
- Supply pages and manufacturer pages: products, other supply pages, relevant guides, enquiry.
- Anchors are varied through `b2bAnchor()` in `views/links.js` instead of one exact-match phrase everywhere.

## Schema

Organization/WebSite unchanged. Added: BreadcrumbList on six more pages, WebPage on /quality and /certifications, `manufacturer` on Product, Article/FAQPage/BreadcrumbList on all new guides, FAQPage and WebPage on the new route. Still none: reviews, ratings, offers, prices, availability, SKU/GTIN, `areaServed`.

## Verification

`scripts/seo-health-check.sh` was extended (heading levels, image dimensions, BreadcrumbList, compression, cache headers, hub-and-spoke body links, title length, restricted "lab verified"). On the final build: 31 pages, 0 failures, 0 warnings. Browser checks at 390, 820, 990, 1024, 1100 and 1280 px over every route: no horizontal overflow, no JS errors, no broken or stretched images.

## Owner decisions still open

1. Real dates for guides and sitemap `lastmod` (items 17, 18).
2. Google Business Profile / social URLs for `sameAs` (item 22).
3. Whether to re-encode large approved images (item 19).
4. Any commercial specifics to publish later: sample availability, MOQ, delivery coverage, or a list of states served. None are stated today.
5. Whether to describe an existing distribution network: nothing says one exists, so the site only says enquiries are welcome from across India.

## Left for Phase 3B and off-site work

Backlinks and citations (Google Business Profile, trade directories, local media), reviews collected from real customers, product photography and video, WebP/AVIF images, font-loading tuning, lastmod/dates, per-state distributor pages only once a real distributor or office exists, Search Console monitoring of the new URLs.

## Final pre-commit review: what changed

- Removed the restaurants/bakeries guide (duplicated the institutional page) and rewrote the bulk procurement guide so it no longer repeats the supplier checklist.
- Softened wording that could read as "customers we serve" on the new manufacturer page ("suits ..." instead of "is bought by ..."), and made the home meta description say that only the atta is stone-ground.
- Long (one-year, immutable) caching now applies only when `?v=` equals the file's current fingerprint; a stale or invented `?v=` gets the one-day cache. HTML and other dynamic responses never receive a Cache-Control header from the static-file code.
- Keyboard: the mobile menu button now has `aria-controls`, Enter moves focus into the menu (the menu precedes the button in page order, so Tab used to skip it), and Escape closes it.
