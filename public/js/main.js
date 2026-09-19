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
})();
