# Hero carousel images

Drop the four real photos here with these exact filenames — the homepage
hero carousel (see `views/home.js`) already references these paths and
will pick them up automatically, no code changes needed:

| Filename                     | Slide                          |
|-------------------------------|---------------------------------|
| `hero-milling.jpg`            | 1 — Modern Flour Mill           |
| `hero-wheat-to-flour.jpg`      | 2 — Wheat to Flour               |
| `hero-quality-hygiene.jpg`     | 3 — Quality & Hygiene            |
| `hero-kitchen.jpg`             | 4 — From Our Mill to Your Kitchen|

**Guidance:**
- Landscape orientation, roughly 1.5–1.6:1 aspect ratio (e.g. 1600×1040px
  or similar) — the panel crops to a fixed aspect ratio via CSS
  `object-fit: cover`, so exact dimensions aren't critical as long as the
  aspect is landscape and the resolution is at least ~1200px wide.
- Keep individual files reasonably optimized for web (a few hundred KB,
  not several MB) — this project intentionally ships lightweight.
- Per the project's honesty rule: these should be genuine or clearly
  representative flour-mill/wheat/grain imagery. Never present a stock or
  illustrative image as if it were an actual photograph of the Devmam
  Flourish Foods LLP facility.

Until real files are added here, each slide falls back to a plain navy
gradient panel (see `.hero-carousel-art` in `public/css/style.css`) rather
than a fake illustration.
