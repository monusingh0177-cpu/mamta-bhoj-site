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
})();
