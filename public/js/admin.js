(function () {
  // Wires up every .image-picker block: a <input type="file"> reads the
  // chosen photo client-side and stores it as a base64 data URL in a hidden
  // field, which is submitted as a normal form field. This lets the server
  // stay dependency-free (no multipart/form-data parser needed).
  document.querySelectorAll('.image-picker').forEach(function (picker) {
    var fileInput = picker.querySelector('input[type="file"]');
    var hidden = picker.querySelector('input[type="hidden"]');
    var preview = picker.querySelector('img');
    if (!fileInput || !hidden) return;
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Please choose an image under 5MB.');
        fileInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        hidden.value = reader.result;
        if (preview) {
          preview.src = reader.result;
          preview.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    });
  });

  // Confirm destructive actions, then give instant feedback on submit
  // (disable + relabel the button) — combined in one listener so a
  // cancelled confirm() never leaves the button stuck disabled.
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.hasAttribute('data-confirm')) {
        if (!confirm(form.getAttribute('data-confirm'))) {
          e.preventDefault();
          return;
        }
      }
      var btn = form.querySelector('button[type="submit"]');
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      btn.textContent = btn.getAttribute('data-loading-text') || 'Please wait…';
    });
  });
})();
