// Small inline-SVG icon & illustration library shared across templates. Kept
// as plain functions returning markup strings — no icon-font, image asset or
// CDN dependency, so every visual on the site is crisp at any size and free
// (all shapes are original line-art, not traced from any real photograph or
// brand mark).
'use strict';

const trust = {
  iso: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6 6.5.9-4.7 4.6 1.1 6.5L12 17l-5.9 3 1.1-6.5L2.5 8.9 9 8z"/></svg>`,
  fssai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  natural: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c3 3.5 5 7 5 10a5 5 0 01-10 0c0-3 2-6.5 5-10z"/></svg>`,
  stone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.9a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.8 2.2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>`,
};

const productIcons = {
  wheat: trust.natural,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>`,
  sack: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l1 4-1 3 2 9H5l2-9-1-3z"/><path d="M9 4a3 3 0 016 0"/></svg>`,
  drop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/></svg>`,
};

// A single stylised wheat ear — the recurring visual motif for the whole
// redesign. `color` accepts any CSS color/var so it can sit on light or dark
// (navy) backgrounds; `grains` controls how many kernel pairs it draws.
function wheatEar(color, grains) {
  color = color || 'currentColor';
  const n = grains || 6;
  let kernels = '';
  for (let i = 0; i < n; i++) {
    const y = 14 + i * 11;
    const s = 1 - i * 0.06;
    kernels += `<g transform="translate(30,${y}) scale(${s.toFixed(2)})">
      <path d="M0 0 C -7 5 -7 12 0 18 C 7 12 7 5 0 0 Z" fill="${color}"/>
    </g>
    <g transform="translate(30,${y + 5}) scale(${s.toFixed(2)}) rotate(180)">
      <path d="M0 0 C -7 5 -7 12 0 18 C 7 12 7 5 0 0 Z" fill="${color}" opacity=".9"/>
    </g>`;
  }
  return `<svg viewBox="0 0 60 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
    <path d="M30 150V40" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
    ${kernels}
    <path d="M30 8 L30 -6" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

// A row of wheat ears used as a section divider / decorative strip. `count`
// ears, alternating heights, rendered on a transparent background so it can
// sit over any section color.
function wheatDivider(color, count) {
  color = color || 'var(--wheat-gold)';
  const n = count || 9;
  let ears = '';
  for (let i = 0; i < n; i++) {
    const alt = i % 2 === 0 ? 0 : 10;
    ears += `<g transform="translate(${i * (100 / (n - 1))},${alt})">${miniEar(color)}</g>`;
  }
  function miniEar(c) {
    return `<g>
      <path d="M0 34V10" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M0 4 C -3 8 -3 13 0 17 C 3 13 3 8 0 4 Z" fill="${c}"/>
      <path d="M0 11 C -3 15 -3 20 0 24 C 3 20 3 15 0 11 Z" fill="${c}" opacity=".85"/>
    </g>`;
  }
  return `<svg viewBox="0 0 100 44" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" style="width:100%;height:44px;display:block;">${ears}</svg>`;
}

// Cinematic hero backdrop: a wide wheat field silhouette + drifting grain
// motes, meant to sit behind the navy gradient overlay in the hero band.
// Legacy circular chakki-wheel mark — kept small and available for use as a
// secondary accent badge (see heroMillVisual), no longer the hero's primary
// visual.
function heroArt() {
  return `<svg viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Traditional chakki grinding wheel mark">
    <circle cx="240" cy="240" r="200" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <circle cx="240" cy="240" r="150" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
    <circle cx="240" cy="240" r="108" fill="none" stroke="var(--wheat-gold)" stroke-width="3"/>
    <circle cx="240" cy="240" r="86" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"/>
    <g stroke="rgba(255,255,255,.4)" stroke-width="2"><path d="M240 154v172M154 240h172M188 188l104 104M292 188L188 292"/></g>
    <circle cx="240" cy="240" r="22" fill="var(--wheat-gold)"/>
    <circle cx="240" cy="240" r="9" fill="var(--brand-navy-dark)"/>
    <g fill="var(--wheat-gold)">
      <g transform="translate(240,60)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/><path d="M0 20 C -8 30 -8 40 0 54 C 8 40 8 30 0 20 Z"/></g>
      <g transform="translate(420,240) rotate(90)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/></g>
      <g transform="translate(240,420) rotate(180)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/><path d="M0 20 C -8 30 -8 40 0 54 C 8 40 8 30 0 20 Z"/></g>
      <g transform="translate(60,240) rotate(270)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/></g>
    </g>
    <g stroke="rgba(255,255,255,.35)" stroke-width="1.4"><path d="M240 60v34M420 240h-34M240 420v-34M60 240h34"/></g>
  </svg>`;
}

// Premium hero visual: a "photo card" panel with a soft navy vignette,
// depth-layered golden wheat (blurred back layer + sharp front layer with a
// dimensional gradient sheen), a faint mill/silo silhouette suggesting the
// manufacturing side, and the traditional chakki mark reduced to a small
// corner seal. Entirely original gradients/shapes — not a photograph and
// not styled to be mistaken for one.
function heroMillVisual() {
  return `<svg viewBox="0 0 520 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Golden wheat grain with a subtle flour mill silhouette, representing Mamta Bhoj's journey from wheat to flour">
    <defs>
      <linearGradient id="hmvPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0a2454"/>
        <stop offset="55%" stop-color="#123a7a"/>
        <stop offset="100%" stop-color="#0a1c40"/>
      </linearGradient>
      <radialGradient id="hmvGlow" cx="50%" cy="38%" r="55%">
        <stop offset="0%" stop-color="#f2c463" stop-opacity=".35"/>
        <stop offset="60%" stop-color="#f2c463" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="hmvKernel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff3d6"/>
        <stop offset="35%" stop-color="#f0bd54"/>
        <stop offset="100%" stop-color="#a9761f"/>
      </linearGradient>
      <linearGradient id="hmvKernelBack" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f5d78a"/>
        <stop offset="100%" stop-color="#b98a2e"/>
      </linearGradient>
      <filter id="hmvBlur"><feGaussianBlur stdDeviation="3.2"/></filter>
    </defs>

    <rect x="0" y="0" width="520" height="600" rx="18" fill="url(#hmvPanel)"/>
    <rect x="0" y="0" width="520" height="600" rx="18" fill="url(#hmvGlow)"/>

    <!-- faint mill / silo silhouette in the background, softly blurred for depth -->
    <g filter="url(#hmvBlur)" opacity=".28">
      <rect x="336" y="150" width="46" height="170" rx="23" fill="#cfe0f5"/>
      <rect x="392" y="120" width="52" height="200" rx="26" fill="#cfe0f5"/>
      <rect x="60" y="200" width="120" height="120" fill="#cfe0f5"/>
      <polygon points="60,200 120,160 180,200" fill="#cfe0f5"/>
    </g>
    <rect x="0" y="300" width="520" height="300" fill="#08183a" opacity=".45"/>

    <!-- back wheat layer: smaller, blurred, further away -->
    <g filter="url(#hmvBlur)" opacity=".55">
      <g transform="translate(110,470) scale(0.8)">${millWheatEar('url(#hmvKernelBack)', 6)}</g>
      <g transform="translate(430,500) scale(0.7) rotate(6)">${millWheatEar('url(#hmvKernelBack)', 5)}</g>
    </g>

    <!-- front wheat layer: sharp, dimensional, the hero focal point -->
    <g transform="translate(210,560) scale(1.15)">${millWheatEar('url(#hmvKernel)', 8)}</g>
    <g transform="translate(300,565) scale(1.02) rotate(-8)">${millWheatEar('url(#hmvKernel)', 7)}</g>
    <g transform="translate(150,555) scale(0.92) rotate(10)">${millWheatEar('url(#hmvKernel)', 6)}</g>

    <!-- soft ground shadow -->
    <ellipse cx="260" cy="588" rx="180" ry="14" fill="#040e26" opacity=".5"/>

    <!-- small chakki seal, secondary accent only -->
    <g transform="translate(72,72)">
      <circle r="46" fill="#0a1c40" stroke="var(--wheat-gold)" stroke-width="2"/>
      <circle r="34" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
      <circle r="7" fill="var(--wheat-gold)"/>
      <g stroke="rgba(255,255,255,.55)" stroke-width="1.6"><path d="M0 -34v20M0 14v20M-34 0h20M14 0h20"/></g>
    </g>

    <rect x="1" y="1" width="518" height="598" rx="17" fill="none" stroke="rgba(242,196,99,.35)" stroke-width="1.5"/>
  </svg>`;
}

// Helper: one wheat ear built from gradient-filled kernels, used inside
// heroMillVisual for a more dimensional, less flat look than the flat
// single-tone wheatEar() used elsewhere on the site.
function millWheatEar(fill, grains) {
  let kernels = '';
  for (let i = 0; i < grains; i++) {
    const y = -i * 15;
    const s = 1 - i * 0.045;
    kernels += `<g transform="translate(0,${y}) scale(${s.toFixed(2)})">
      <path d="M0 0 C -9 6 -9 15 0 23 C 9 15 9 6 0 0 Z" fill="${fill}"/>
    </g>
    <g transform="translate(0,${y - 6}) scale(${s.toFixed(2)}) rotate(180)">
      <path d="M0 0 C -9 6 -9 15 0 23 C 9 15 9 6 0 0 Z" fill="${fill}" opacity=".92"/>
    </g>`;
  }
  return `<g>
    <path d="M0 30V${-grains * 15 + 30}" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>
    ${kernels}
  </g>`;
}

// Richer facility illustration: mill building, twin storage silos, wheat
// sacks and a delivery of raw grain — used on "Who We Are" / About sections.
function aboutArt() {
  return `<svg viewBox="0 0 480 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration of the flour mill facility with silos and wheat sacks">
    <rect width="480" height="380" fill="var(--surface)"/>
    <rect x="0" y="260" width="480" height="120" fill="var(--stone)"/>
    <g fill="var(--wheat-gold)" opacity=".5"><circle cx="60" cy="60" r="3"/><circle cx="120" cy="40" r="2"/><circle cx="380" cy="55" r="3"/><circle cx="420" cy="90" r="2"/></g>
    <g><rect x="150" y="150" width="130" height="130" fill="var(--cream-soft)" stroke="var(--brand-navy)" stroke-width="1.5"/>
      <polygon points="150,150 215,110 280,150" fill="var(--brand-navy)"/>
      <rect x="200" y="210" width="36" height="70" fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1.2"/>
      <rect x="162" y="170" width="26" height="26" fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1"/>
      <rect x="242" y="170" width="26" height="26" fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1"/></g>
    <g stroke="var(--wheat-gold)" stroke-width="2" fill="var(--cream-soft)"><rect x="60" y="150" width="46" height="130" rx="23"/><rect x="325" y="130" width="50" height="150" rx="25"/></g>
    <g stroke="var(--wheat-gold-dark)" stroke-width="1.5" fill="none" opacity=".6"><path d="M60 165h46M60 185h46M325 145h50M325 165h50"/></g>
    <g fill="var(--cream-soft)" stroke="var(--ink-soft)" stroke-width="1.4">
      <ellipse cx="300" cy="300" rx="26" ry="20"/><ellipse cx="335" cy="305" rx="26" ry="20"/>
      <path d="M292 288 q8 -14 16 0" fill="none"/><path d="M327 293 q8 -14 16 0" fill="none"/></g>
    <g stroke="var(--wheat-gold)" stroke-width="2.4" fill="none"><path d="M20 300 V240"/><path d="M40 300 V225"/><path d="M420 300 V245"/><path d="M440 300 V255"/></g>
    <g fill="var(--wheat-gold)"><g transform="translate(20,232)"><path d="M0 0 C -6 8 -6 16 0 26 C 6 16 6 8 0 0 Z"/></g><g transform="translate(40,217)"><path d="M0 0 C -6 8 -6 16 0 26 C 6 16 6 8 0 0 Z"/></g><g transform="translate(420,237)"><path d="M0 0 C -6 8 -6 16 0 26 C 6 16 6 8 0 0 Z"/></g><g transform="translate(440,247)"><path d="M0 0 C -6 8 -6 16 0 26 C 6 16 6 8 0 0 Z"/></g></g>
  </svg>`;
}

const galleryArt = {
  field: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wheat field illustration"><rect width="200" height="250" fill="var(--surface)"/><rect y="150" width="200" height="100" fill="var(--wheat-gold)" opacity=".16"/><g stroke="var(--wheat-gold)" stroke-width="2.2" fill="none"><path d="M30 240 V150 M60 240 V140 M90 240 V155 M120 240 V138 M150 240 V152 M175 240 V145"/></g><g fill="var(--wheat-gold)"><circle cx="30" cy="146" r="5"/><circle cx="60" cy="136" r="5"/><circle cx="90" cy="151" r="5"/><circle cx="120" cy="134" r="5"/><circle cx="150" cy="148" r="5"/><circle cx="175" cy="141" r="5"/></g></svg>`,
  silo: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Storage silos illustration"><rect width="200" height="250" fill="var(--surface)"/><g fill="var(--cream-soft)" stroke="var(--brand-navy)" stroke-width="2"><rect x="35" y="70" width="45" height="140" rx="22"/><rect x="115" y="50" width="50" height="160" rx="25"/></g><g stroke="var(--wheat-gold)" stroke-width="1.4" opacity=".7"><path d="M35 100h45M35 130h45M115 90h50M115 120h50"/></g><rect y="205" width="200" height="45" fill="var(--stone)"/></svg>`,
  chakki: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stone grinding chakki illustration"><rect width="200" height="250" fill="var(--surface)"/><circle cx="100" cy="125" r="70" fill="none" stroke="var(--wheat-gold)" stroke-width="4"/><circle cx="100" cy="125" r="52" fill="none" stroke="var(--brand-navy)" stroke-width="2.5"/><circle cx="100" cy="125" r="12" fill="var(--brand-navy)"/><g stroke="var(--ink-soft)" stroke-width="2"><path d="M100 55v140M30 125h140"/></g></svg>`,
  pack: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Packed atta bags illustration"><rect width="200" height="250" fill="var(--surface)"/><g fill="var(--cream-soft)" stroke="var(--ink-soft)" stroke-width="2"><rect x="45" y="120" width="60" height="80" rx="4"/><rect x="95" y="100" width="60" height="100" rx="4"/></g><g fill="var(--brand-navy)"><rect x="55" y="135" width="40" height="10"/><rect x="105" y="115" width="40" height="10"/></g><g fill="var(--wheat-gold)"><circle cx="75" cy="160" r="3"/><circle cx="125" cy="140" r="3"/></g></svg>`,
};

// "From Wheat to Flour" journey icons — six clean line-art marks used on the
// process/storytelling sections.
const journeyIcons = {
  rawWheat: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 34V16"/><path d="M20 6c-5 3-5 8 0 13 5-5 5-10 0-13z"/><path d="M20 14c-4 2-4 6 0 10 4-4 4-8 0-10z"/></svg>`,
  cleaning: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="20" r="14"/><path d="M13 20l5 5 9-11"/></svg>`,
  milling: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="20" r="15"/><circle cx="20" cy="20" r="4"/><path d="M20 8v4M20 28v4M8 20h4M28 20h4M11 11l3 3M26 26l3 3M29 11l-3 3M14 26l-3 3"/></svg>`,
  qualityCheck: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="17" r="11"/><path d="M13 17l3 3 6-7"/><path d="M25 25l8 8"/></svg>`,
  packaging: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l14-7 14 7-14 7-14-7z"/><path d="M6 14v13l14 7 14-7V14"/><path d="M20 21v13"/></svg>`,
  readyKitchen: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24c0-8 5-14 12-14s12 6 12 14"/><path d="M6 24h28"/><path d="M6 30h28"/></svg>`,
};

module.exports = {
  trust,
  productIcons,
  heroArt,
  heroMillVisual,
  aboutArt,
  galleryArt,
  journeyIcons,
  wheatEar,
  wheatDivider,
};
