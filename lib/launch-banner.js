'use strict';

// Factory inauguration banner popup. Shown on every public page load until the
// end of Sunday 18 Oct 2026 (Asia/Kolkata, UTC+05:30, no DST). Expiry is
// evaluated per request from the clock, so no cron job or restart is needed;
// the popup markup also carries the expiry so a cached page hides it client-side.
// Admin pages use lib/admin-render.js, not layout(), so they never include it.

const BANNER_SRC = '/images/factory-inauguration-banner.png';
const BANNER_WIDTH = 1024;
const BANNER_HEIGHT = 1536;
const BANNER_ALT = 'Grand inauguration of the new Mamta Bhoj factory by Devmam Flourish Foods LLP';
const EXPIRES_AT = Date.parse('2026-10-19T00:00:00+05:30'); // 19 Oct 2026, 00:00 IST

function isBannerActive(now) {
  const t = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now());
  return t < EXPIRES_AT;
}

function launchBannerHtml(now) {
  if (!isBannerActive(now)) return '';
  return `<div class="launch-modal" id="launch-modal" data-expires="${EXPIRES_AT}" role="dialog" aria-modal="true" aria-label="Factory inauguration announcement" hidden>
<div class="launch-modal__frame">
<button type="button" class="launch-modal__close" id="launch-modal-close" aria-label="Close inauguration banner"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
<img class="launch-modal__img" src="${BANNER_SRC}" width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" alt="${BANNER_ALT}" decoding="async">
</div>
</div>`;
}

module.exports = { launchBannerHtml, isBannerActive, EXPIRES_AT };
