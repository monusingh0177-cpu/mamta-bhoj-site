(function () {
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var isHidden = links.hasAttribute('hidden');
      if (isHidden) {
        links.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        // The menu sits before the button in the page order, so move keyboard
        // focus into it; otherwise Tab would skip straight past the links.
        var first = links.querySelector('a');
        if (first) first.focus();
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
    // Escape closes the open menu and returns focus to the menu button.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || links.hasAttribute('hidden') || toggle.offsetParent === null) return;
      links.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
  }

  // Give instant feedback on form submit (plain POSTs that reload the page, e.g. the newsletter box):
  // a disabled/relabelled button prevents double-submits and shows the visitor something is happening.
  document.querySelectorAll('form').forEach(function (form) {
    if (form.hasAttribute('data-enquiry-form')) return; // handled below
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn || btn.disabled) return;
      btn.setAttribute('data-label', btn.textContent);
      btn.disabled = true;
      btn.textContent = btn.getAttribute('data-loading-text') || 'Please wait…';
    });
  });
  // A page restored from the back/forward cache must not keep a button stuck on "Sending…".
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    document.querySelectorAll('button[type="submit"][data-label]').forEach(function (btn) {
      btn.disabled = false;
      btn.textContent = btn.getAttribute('data-label');
    });
  });

  // Enquiry form: sent in the background so the visitor always gets a clear answer on the page, never a
  // raw gateway error page. Without JavaScript (or fetch) the form is an ordinary POST and still works.
  var enquiryForm = document.querySelector('form[data-enquiry-form]');
  if (enquiryForm && window.fetch && window.FormData && window.URLSearchParams && window.AbortController) {
    var statusBox = document.getElementById('enquiry-status');
    var submitBtn = enquiryForm.querySelector('button[type="submit"]');
    var idleLabel = submitBtn ? submitBtn.textContent : 'Send Enquiry';
    var busy = false;
    var SEND_TIMEOUT_MS = 20000;
    var phone = enquiryForm.getAttribute('data-phone') || '';
    var email = enquiryForm.getAttribute('data-email') || '';
    var contactHint = (phone ? ' call us on ' + phone : '') + (phone && email ? ' or' : '') + (email ? ' email ' + email : '');

    var showStatus = function (kind, text) {
      statusBox.className = 'enquiry-status alert alert-' + kind;
      statusBox.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      statusBox.textContent = text; // text only, never markup
      statusBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      statusBox.focus({ preventScroll: true });
    };
    var clearErrors = function () {
      statusBox.className = 'enquiry-status';
      statusBox.textContent = '';
      enquiryForm.querySelectorAll('.field-error').forEach(function (n) { n.remove(); });
      enquiryForm.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
    };
    var markFields = function (fields) {
      var first = null;
      Object.keys(fields || {}).forEach(function (name) {
        var input = enquiryForm.elements[name];
        if (!input || !input.parentNode) return;
        input.setAttribute('aria-invalid', 'true');
        var msg = document.createElement('span');
        msg.className = 'field-error';
        msg.textContent = String(fields[name]);
        input.parentNode.appendChild(msg);
        if (!first) first = input;
      });
      if (first) first.focus({ preventScroll: true });
    };
    var failure = function (timedOut) {
      showStatus('error', timedOut
        ? 'This is taking longer than expected. Your enquiry may already have been received, so please check before sending it again, or' + contactHint + '.'
        : 'Sorry, we could not send your enquiry just now. Please try again in a minute, or' + contactHint + '.');
    };

    enquiryForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return; // a second click while the first is in flight does nothing
      if (!enquiryForm.checkValidity()) { enquiryForm.reportValidity(); return; }
      busy = true;
      clearErrors();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      enquiryForm.setAttribute('aria-busy', 'true');
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, SEND_TIMEOUT_MS);
      fetch(enquiryForm.getAttribute('action') || '/contact', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(new FormData(enquiryForm)).toString(),
        signal: controller.signal,
      })
        .then(function (res) {
          return res.json().then(function (data) { return { res: res, data: data }; }, function () { return { res: res, data: null }; });
        })
        .then(function (r) {
          if (r.data && r.data.ok) {
            showStatus('success', r.data.message || 'Thank you! Your enquiry has been submitted successfully. We will contact you shortly.');
            enquiryForm.reset();
          } else if (r.res.status === 422 && r.data && r.data.fields) {
            markFields(r.data.fields);
            showStatus('error', r.data.message || 'Please check the highlighted details and try again.');
          } else {
            failure(false);
          }
        })
        .catch(function (err) { failure(Boolean(err && err.name === 'AbortError')); })
        .then(function () {
          clearTimeout(timer);
          busy = false;
          submitBtn.disabled = false;
          submitBtn.textContent = idleLabel;
          enquiryForm.removeAttribute('aria-busy');
        });
    });
  }

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

  // Carousels — plain vanilla JS, no slider library. Handles every
  // [data-carousel] on the page (hero, about-mill, ...) independently,
  // targeting slides/dots/arrows/images by data-* hooks so each carousel
  // is free to use its own class names for styling.
  var carousels = Array.prototype.slice.call(document.querySelectorAll('[data-carousel]'));
  carousels.forEach(function (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('[data-slide-index]'));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll('[data-slide-goto]'));
    var prevBtn = carousel.querySelector('[data-carousel-prev]');
    var nextBtn = carousel.querySelector('[data-carousel-next]');
    var interval = parseInt(carousel.getAttribute('data-carousel-interval'), 10) || 5500;
    var current = 0;
    var timer = null;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // If a slide's real photo hasn't been added yet, fall back to a plain
    // brand-navy panel (see .img-missing in style.css) instead of showing
    // the browser's broken-image icon.
    carousel.querySelectorAll('[data-carousel-img]').forEach(function (img) {
      img.addEventListener('error', function () {
        var slide = img.closest('[data-slide-index]');
        if (slide) slide.classList.add('img-missing');
      });
      if (img.complete && img.naturalWidth === 0) {
        var slide = img.closest('[data-slide-index]');
        if (slide) slide.classList.add('img-missing');
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
      timer = setInterval(function () { showSlide(current + 1); }, interval);
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

    if (slides.length) showSlide(0);
    startAuto();
  });
})();
