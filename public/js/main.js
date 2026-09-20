(function () {
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var isHidden = links.hasAttribute('hidden');
      if (isHidden) {
        links.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        links.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Give instant feedback on form submit (these are plain POSTs that reload
  // the page, so a disabled/relabelled button just prevents double-submits
  // and shows the visitor something is happening while the page navigates).
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      btn.textContent = btn.getAttribute('data-loading-text') || 'Please wait…';
    });
  });

  // Subtle reveal-on-scroll for [data-reveal] / [data-reveal-item] elements.
  // The CSS only hides these once html.js-reveal-ready is present, so the
  // page is fully visible immediately if JS fails to load or IntersectionObserver
  // is unsupported — this is a progressive enhancement, never a requirement.
  if ('IntersectionObserver' in window) {
    var targets = document.querySelectorAll('[data-reveal], [data-reveal-item]');
    if (targets.length) {
      document.documentElement.classList.add('js-reveal-ready');
      var revealAll = function () {
        targets.forEach(function (el) { el.classList.add('is-revealed'); });
      };
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-revealed');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
      targets.forEach(function (el) { io.observe(el); });
      // Safety net: content must never stay invisible. If anything is still
      // unrevealed a couple of seconds after load (observer edge cases,
      // very short pages, print/export contexts), just show it.
      window.addEventListener('load', function () {
        setTimeout(revealAll, 2500);
      });
    }
  }

  // Hero carousel — plain vanilla JS, no slider library.
  var carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('.hero-carousel-slide'));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll('.hero-carousel-dot'));
    var prevBtn = carousel.querySelector('.hero-carousel-arrow--prev');
    var nextBtn = carousel.querySelector('.hero-carousel-arrow--next');
    var current = 0;
    var timer = null;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // If a slide's real photo hasn't been added yet at public/images/hero/,
    // fall back to a plain brand-navy panel (see .img-missing in style.css)
    // instead of showing the browser's broken-image icon.
    carousel.querySelectorAll('.hero-carousel-art img').forEach(function (img) {
      img.addEventListener('error', function () {
        img.closest('.hero-carousel-slide').classList.add('img-missing');
      });
      if (img.complete && img.naturalWidth === 0) {
        img.closest('.hero-carousel-slide').classList.add('img-missing');
      }
    });

    function showSlide(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        var active = i === current;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach(function (dot, i) {
        var active = i === current;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    var isHovering = false;
    var isFocused = false;

    function stopAuto() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    // Clicking a dot/arrow doesn't re-fire mouseenter (the pointer was
    // already inside the carousel), so startAuto must itself respect an
    // in-progress hover/focus rather than unconditionally restarting —
    // otherwise a click while the mouse rests on the carousel would resume
    // auto-advance right under the user's cursor.
    function startAuto() {
      if (reduceMotion || slides.length < 2 || isHovering || isFocused) return;
      stopAuto();
      timer = setInterval(function () { showSlide(current + 1); }, 5500);
    }

    if (nextBtn) nextBtn.addEventListener('click', function () { showSlide(current + 1); startAuto(); });
    if (prevBtn) prevBtn.addEventListener('click', function () { showSlide(current - 1); startAuto(); });
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { showSlide(i); startAuto(); });
    });

    carousel.addEventListener('mouseenter', function () { isHovering = true; stopAuto(); });
    carousel.addEventListener('mouseleave', function () { isHovering = false; startAuto(); });
    carousel.addEventListener('focusin', function () { isFocused = true; stopAuto(); });
    carousel.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!carousel.contains(document.activeElement)) { isFocused = false; startAuto(); }
      }, 0);
    });

    showSlide(0);
    startAuto();
  }
})();
