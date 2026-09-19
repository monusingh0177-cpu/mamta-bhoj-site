// Small inline-SVG icon library shared across templates. Kept as plain
// functions returning markup strings — no icon-font or CDN dependency.
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
};

function heroArt() {
  return `<svg viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration of a traditional chakki grinding wheel surrounded by wheat stalks">
    <circle cx="240" cy="240" r="200" fill="none" stroke="var(--cream-line)" stroke-width="1"/>
    <circle cx="240" cy="240" r="150" fill="var(--cream-soft)" stroke="var(--cream-line)" stroke-width="1"/>
    <circle cx="240" cy="240" r="108" fill="none" stroke="var(--gold)" stroke-width="3"/>
    <circle cx="240" cy="240" r="86" fill="none" stroke="var(--red)" stroke-width="2"/>
    <g stroke="var(--ink)" stroke-width="2" opacity=".55"><path d="M240 154v172M154 240h172M188 188l104 104M292 188L188 292"/></g>
    <circle cx="240" cy="240" r="22" fill="var(--red)"/>
    <circle cx="240" cy="240" r="9" fill="var(--cream-soft)"/>
    <g fill="var(--gold)">
      <g transform="translate(240,60)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/><path d="M0 20 C -8 30 -8 40 0 54 C 8 40 8 30 0 20 Z"/></g>
      <g transform="translate(420,240) rotate(90)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/></g>
      <g transform="translate(240,420) rotate(180)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/><path d="M0 20 C -8 30 -8 40 0 54 C 8 40 8 30 0 20 Z"/></g>
      <g transform="translate(60,240) rotate(270)"><path d="M0 0 C -10 14 -10 28 0 46 C 10 28 10 14 0 0 Z"/><path d="M0 10 C -9 22 -9 34 0 50 C 9 34 9 22 0 10 Z"/></g>
    </g>
    <g stroke="var(--ink-soft)" stroke-width="1.4" opacity=".5"><path d="M240 60v34M420 240h-34M240 420v-34M60 240h34"/></g>
  </svg>`;
}

function aboutArt() {
  return `<svg viewBox="0 0 480 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration of the flour mill facility with silos and wheat sacks">
    <rect width="480" height="380" fill="var(--cream-soft)"/>
    <rect x="0" y="260" width="480" height="120" fill="var(--cream-line)" opacity=".5"/>
    <g fill="var(--cream-line)" opacity=".7"><circle cx="60" cy="60" r="3"/><circle cx="120" cy="40" r="2"/><circle cx="380" cy="55" r="3"/><circle cx="420" cy="90" r="2"/></g>
    <g><rect x="150" y="150" width="130" height="130" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="1.5"/>
      <polygon points="150,150 215,110 280,150" fill="var(--red)"/>
      <rect x="200" y="210" width="36" height="70" fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1.2"/>
      <rect x="162" y="170" width="26" height="26" fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1"/>
      <rect x="242" y="170" width="26" height="26" fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1"/></g>
    <g stroke="var(--gold)" stroke-width="2" fill="var(--cream)"><rect x="60" y="170" width="46" height="110" rx="23"/><rect x="325" y="150" width="50" height="130" rx="25"/></g>
    <g fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="1.4">
      <ellipse cx="300" cy="300" rx="26" ry="20"/><ellipse cx="335" cy="305" rx="26" ry="20"/>
      <path d="M292 288 q8 -14 16 0" fill="none"/><path d="M327 293 q8 -14 16 0" fill="none"/></g>
    <g stroke="var(--gold)" stroke-width="2" fill="none" opacity=".8"><path d="M20 300 q10 -30 0 -60"/><path d="M40 300 q10 -40 -2 -75"/><path d="M440 300 q-10 -30 0 -55"/></g>
  </svg>`;
}

const galleryArt = {
  field: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wheat field illustration"><rect width="200" height="250" fill="var(--cream-soft)"/><rect y="150" width="200" height="100" fill="var(--gold)" opacity=".18"/><g stroke="var(--gold)" stroke-width="2.2" fill="none"><path d="M30 240 V150 M60 240 V140 M90 240 V155 M120 240 V138 M150 240 V152 M175 240 V145"/></g><g fill="var(--gold)"><circle cx="30" cy="146" r="5"/><circle cx="60" cy="136" r="5"/><circle cx="90" cy="151" r="5"/><circle cx="120" cy="134" r="5"/><circle cx="150" cy="148" r="5"/><circle cx="175" cy="141" r="5"/></g></svg>`,
  silo: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Storage silos illustration"><rect width="200" height="250" fill="var(--cream-soft)"/><g fill="var(--cream)" stroke="var(--red)" stroke-width="2"><rect x="35" y="70" width="45" height="140" rx="22"/><rect x="115" y="50" width="50" height="160" rx="25"/></g><rect y="205" width="200" height="45" fill="var(--cream-line)" opacity=".6"/></svg>`,
  chakki: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stone grinding chakki illustration"><rect width="200" height="250" fill="var(--cream-soft)"/><circle cx="100" cy="125" r="70" fill="none" stroke="var(--gold)" stroke-width="4"/><circle cx="100" cy="125" r="52" fill="none" stroke="var(--red)" stroke-width="2.5"/><circle cx="100" cy="125" r="12" fill="var(--red)"/><g stroke="var(--ink-soft)" stroke-width="2"><path d="M100 55v140M30 125h140"/></g></svg>`,
  pack: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Packed atta bags illustration"><rect width="200" height="250" fill="var(--cream-soft)"/><g fill="var(--cream)" stroke="var(--ink-soft)" stroke-width="2"><rect x="45" y="120" width="60" height="80" rx="4"/><rect x="95" y="100" width="60" height="100" rx="4"/></g><g fill="var(--red)"><rect x="55" y="135" width="40" height="10"/><rect x="105" y="115" width="40" height="10"/></g></svg>`,
};

module.exports = { trust, productIcons, heroArt, aboutArt, galleryArt };
