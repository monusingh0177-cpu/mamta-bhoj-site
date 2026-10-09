# On-page keyword coverage — before / after (not committed, awaiting review)

Date: 2026-10-09 · Measured on the code in this working tree, served from an isolated local copy
(the live site is not reachable from the audit environment). Counts are mentions in the page body
(headings, paragraphs, link text, tables, FAQs); titles and meta descriptions were reviewed separately.

## What the audit found

The existing structure already covers every family. Titles, descriptions, H1s, breadcrumbs, Product
schema (manufacturer, no offers) and internal links were sound. The gaps were small: a few families had
**zero** body mentions, and the product pages did not say, in their own words, that the product comes
from the manufacturer and is available to businesses. So this change is **copy only, on existing pages**.
No new pages, no new URLs, no title/description/H1/schema changes.

## Keyword → target page, before → after

| Keyword family | Target page (existing) | Before | After | Change made |
|---|---|---|---|---|
| flour manufacturer India | `/flour-manufacturer-india` | 2 (title, H1) | 2 | none needed; title, H1, intro already carry it |
| flour supplier India | `/flour-manufacturer-india`, `/bulk-flour-supplier-india` | 1 | 2 | new sentence: "a flour supplier in India that mills what it sells" |
| bulk flour supplier India | `/bulk-flour-supplier-india` | 1 (title, H1) | 1 | none needed |
| wheat flour supplier | `/bulk-flour-supplier-india` | **0** | 1 | one sentence: four of five products are wheat flours; besan is the exception |
| wholesale flour supplier | `/wholesale-flour-supplier` | 1 (title, H1) | 1 | none needed |
| flour mill manufacturer India | `/flour-manufacturer-india`, `/flour-manufacturer-kanpur` | 23 (18 pages, mostly the generic words "flour mill") | 25 (19 pages) | intro: "a working flour mill with its own range" |
| atta manufacturer India | `/flour-manufacturer-india#atta` | 1 | 1 | none needed (section H2 already uses it) |
| bulk atta supplier | `/bulk-flour-supplier-india` | **0** | 1 | "bulk atta for canteens and caterers"; link from the atta section |
| maida manufacturer India | `/flour-manufacturer-india#maida`, `/products/maida` | 2 | 3 | product page "supply" sentence |
| maida flour supplier | `/products/maida`, `/flour-manufacturer-india` | 1 | 3 | manufacturer page sentence linking to institutional page; product "supply" sentence |
| besan manufacturer India | `/flour-manufacturer-india#besan`, `/products/besan` | 6 | 7 | product "supply" sentence |
| besan supplier India | `/products/besan`, `/flour-manufacturer-india` | 1 | 3 | manufacturer page sentence linking to wholesale page; product "supply" sentence |
| sooji manufacturer India | `/flour-manufacturer-india#sooji`, `/products/sooji-rava` | 2 | 2 | none needed |
| semolina flour manufacturer | `/products/sooji-rava`, `/flour-manufacturer-india#sooji` | 3 | 3 | "semolina flour" wording in the sooji section |
| whole wheat flour manufacturer | `/flour-manufacturer-india#atta`, `/products/fresh-chakki-atta` | 23 (13 pages) | 25 | "100% whole wheat flour" wording on the manufacturer page |
| chakki atta supplier | `/products/fresh-chakki-atta`, `/wholesale-flour-supplier`, `/flour-manufacturer-india` | **0** | 3 | product "supply" sentence; wholesale and manufacturer page sentences |
| institutional flour supplier | `/institutional-flour-supplier` | 24 (19 pages) | 26 | none needed; Chakki Atta page now links to it |
| flour supply and distribution India | `/supply-distribution-india` | 12 (9 pages) | 12 | none needed |

## Files changed (3, all view copy; nothing else)

- `views/b2b-pages.js` — manufacturer, bulk and wholesale page copy (8 sentences/phrases)
- `views/product-content.js` — a one-sentence "supply" line per product; Chakki Atta page also links to the institutional page
- `views/product-detail.js` — renders that line in the "Buying … for your business?" section; hero image alt now says what is in the pack (for example "…Maida pack, refined wheat flour")

Changed pages (8): `/flour-manufacturer-india`, `/bulk-flour-supplier-india`, `/wholesale-flour-supplier`, and the five product pages. All 23 other pages are byte-identical.

## Evidence the copy is natural and not cannibalising

- **No new URLs.** Each family stays on the page that already owns it (manufacturer overview, bulk, wholesale, institutional, distribution, and the five product pages). The product pages target the product ("what is maida", uses, FAQ); the commercial pages target the buyer type. The change adds the manufacturer/supplier context to products and links to the commercial page rather than repeating its content.
- **No repetition.** The most repeated phrase after the change is "flour manufacturer" on the manufacturer page: 7 mentions in about 1,500 words, including the H1 and FAQ. On every other page no target phrase appears more than 3 times. Each product page uses its own wording (chakki atta supplier / tandoori atta supply / maida manufacturer / sooji and rava / besan manufacturer), not one template.
- **Titles, descriptions, H1s unchanged**, so no duplicate or cannibalising metadata (the check confirms unique titles and descriptions, one H1 each).
- **No unsupported claims.** Nothing added about prices, MOQ, capacity, delivery, customers, locations, certifications beyond ISO 9001:2015 / FSSAI, private-label or OEM. "Milled at our own unit in Kanpur" is already stated on the site. "Four of five products are wheat flours" is a plain fact about the range.

## Internal links (verified in the rendered pages)

- Product → manufacturer: all 5 link to `/flour-manufacturer-india` and the Kanpur page, each with different anchor text.
- Product → bulk/wholesale/institutional: every product links to 2 to 3 of them (Chakki Atta now 3: bulk, wholesale, institutional).
- Guide → commercial: every guide links to 3 or more commercial pages (the buying guides to 5 and 6).
- Manufacturer → products: links to all 5 product pages, plus the bulk, wholesale, institutional and distribution pages.
- Anchor text to the manufacturer page uses 12 distinct phrasings; no single exact-match anchor dominates.

## Not changed, and why

- **Article `datePublished` / `dateModified`: not added.** No verified publication date exists anywhere in the project data (guides carry no date field). Dates inferred from commits would be invented, so none were added. If you give me the real publication date for each guide, they can be added from that.
- **Product schema:** unchanged, still no `offers` or `price` (verified across all pages).
- **Titles/meta descriptions:** left as they are; they already map one family to one page.
- **Competitors (Energy Aahar, Arti Roller Flour):** their sites could not be fetched from here, so no competitor comparison was made. The work is based on the site's own coverage gaps.

## Test results (working tree, nothing committed)

- SEO health + hard check: **1202 passed, 0 failed, 0 warnings** (31 pages, duplicate titles/descriptions, H1, canonicals, schema, orphan/link checks included)
- JSON-LD identical before and after on all 31 pages; no `offers`, `price` or `datePublished` anywhere
- Browser check at 390, 820, 990, 1024, 1100 and 1280 px across all pages: **0 problems** (no horizontal scroll, broken images, console errors or layout shift)
- `node --check` on all JS: clean · `npm run test:enquiry`: 99 passed, 0 failed
- Protected files (`data/`, uploads, `.env`, mailer, admin/auth, deploy scripts, `render.yaml`): untouched

Ranking changes cannot be promised or measured from here; check Search Console after deployment.
