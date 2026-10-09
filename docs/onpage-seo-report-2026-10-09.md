# On-page SEO report — devmamflourishfoods.com

Date: 2026-10-09 · Scope: all 31 indexable URLs in the sitemap

## How this was measured (read first)

The live site could not be reached from the audit environment (no route to the production server or its HTTPS
endpoint). This report therefore audits **the code on `origin/main` (`3f814b0`) served from a local, isolated
copy**, using the repo's strict checker (`npm run seo:hard-check`, 1,204 checks) plus a per-page extraction.
It describes what the site *should* serve once that commit is deployed. It does **not** prove what production
serves today: the later SEO and enquiry commits may not be deployed yet. Re-run against the live site with
`scripts/seo-hard-check.sh --base-url https://devmamflourishfoods.com` from a machine with internet access.

Not covered here (needs live or third-party data): Core Web Vitals / speed, Google Search Console indexing and
queries, rankings, backlinks, Google Business Profile, and mobile rendering on real devices.

## Result: PASS — 1,202 passed, 0 failed, 0 warnings, 2 skipped

## Scorecard

| Area | Result | Detail |
|---|---|---|
| Title tags | Good | 31/31 present, unique, 37–60 characters on screen (no duplicates) |
| Meta descriptions | Good | 31/31 present, 124–159 characters |
| H1 | Good | exactly one H1 on every page |
| Heading structure | Mostly good | H2s used on every content page; the FAQ and Contact pages have only one H2 |
| Canonical URLs | Good | every page self-canonical on `https://devmamflourishfoods.com`, matching the sitemap |
| Indexability | Good | all 31 pages indexable, in the sitemap, status 200; status views (`?sent`, `?error`) are `noindex` |
| robots.txt and sitemap.xml | Good | 16 checks passed |
| Structured data | Good | Product (5 products), Article (10 guides), BreadcrumbList, AboutPage, ContactPage, CollectionPage, ItemPage |
| Open Graph and Twitter cards | Good | present on all 31 pages |
| Images | Good | 143 images, 0 missing alt text, 0 missing width/height (prevents layout shift) |
| Language and viewport | Good | `lang="en"` and mobile viewport on all pages |
| Internal links | Good | 34–54 internal links per page; no broken internal links or assets |
| Duplicate content / cannibalisation | Good | 6 checks passed |
| Prohibited or risky claims | Good | 8 checks passed |
| Hostname and HTTPS consistency | Good | 4 checks passed |
| Thin content | Needs work | see below |

## Page inventory

| URL | Title | Description | Schema |
|---|---|---|---|
| `/` | 54 | 152 | WebPage |
| `/about` | 50 | 155 | AboutPage, Breadcrumb |
| `/products` | 52 | 136 | CollectionPage, Breadcrumb |
| `/quality` | 54 | 136 | WebPage, Breadcrumb |
| `/faq` | 37 | 140 | WebPage, Breadcrumb |
| `/certifications` | 49 | 151 | WebPage, Breadcrumb |
| `/contact` | 43 | 124 | ContactPage, Breadcrumb |
| `/flour-manufacturer-kanpur`, `/flour-manufacturer-india`, `/bulk-flour-supplier-india`, `/wholesale-flour-supplier`, `/institutional-flour-supplier`, `/supply-distribution-india` | 54–60 | 147–157 | WebPage, Breadcrumb |
| `/guides` | 55 | 139 | CollectionPage, Breadcrumb |
| 10 guide pages under `/guides/` | 46–60 | 139–159 | WebPage, Breadcrumb, Article |
| 5 product pages under `/products/` | 45–55 | 134–158 | ItemPage, Breadcrumb, Product |

(Title and description columns are character counts.)

## Issues and recommendations

Priority 1 — worth doing
1. **Thin pages.** `/contact` (about 190 words), `/certifications` (about 220), `/quality` (about 290) and `/faq`
   (about 330) are short. Add genuinely useful text: for `/quality`, the testing and packaging steps; for
   `/certifications`, what each certificate covers and its validity; for `/faq`, more real buyer questions
   (minimum order, delivery area, sample policy) with FAQ answers written out in full. Only add claims you can
   back up with documents.
2. **Verify production matches `main`.** Run the live check above after deploying. Today's production state is unknown.

Priority 2 — improvements
3. **FAQ and Contact heading depth.** Add a few descriptive H2s (for example "Ordering and delivery",
   "Quality and storage") so the pages are easier to scan and to rank for question-style queries.
4. **FAQPage structured data** on `/faq`, only if the visible questions and answers match the markup exactly.
5. **Search Console.** Submit `https://devmamflourishfoods.com/sitemap.xml`, request indexing for the key
   commercial pages, and review the Pages and Enhancements reports. That data cannot be seen from here.
6. **Page speed.** Run PageSpeed Insights on the home page, one product page and one guide, and compare
   Largest Contentful Paint and image sizes. Nothing in the code audit suggests a problem, but it was not measured.

Priority 3 — keep doing
7. Keep one H1 per page, unique titles and descriptions, and self-canonicals when adding pages.
8. Re-run `npm run seo:hard-check` before every release.

## Strengths
- Clean URL structure: commercial pages, 10 educational guides and 5 product pages, all internally linked.
- Consistent metadata and schema across every page, with breadcrumbs.
- No missing alt text, no duplicate titles, no broken internal links.
- Status views and test submissions are kept out of the index.
