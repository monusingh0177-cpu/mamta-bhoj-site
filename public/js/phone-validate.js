// Indian mobile number checks for the enquiry form (browser side). The server repeats the same rules
// in lib/enquiry.js and never trusts this file: it only gives instant feedback.
(function (root) {
  var PHONE_RE = /^[6-9][0-9]{9}$/;

  // Trim, then drop spaces and hyphens typed between digits. Nothing else is changed.
  function normalize(value) {
    return String(value == null ? '' : value).trim().replace(/[\s\-]+/g, '');
  }

  // Returns '' when valid, otherwise a short message for the visitor.
  function error(value) {
    var p = normalize(value);
    if (!p) return 'Please enter your 10-digit mobile number.';
    if (!/^[0-9]+$/.test(p)) return 'Please enter digits only (no letters, spaces or +91).';
    if (p.length < 10) return 'That number is too short. Please enter all 10 digits.';
    if (p.length > 10) return 'That number is too long. Please enter exactly 10 digits, without +91 or 0.';
    if (!PHONE_RE.test(p)) return 'An Indian mobile number must start with 6, 7, 8 or 9.';
    return '';
  }

  // For pasted text only: 91XXXXXXXXXX or 0XXXXXXXXXX becomes the 10-digit number the visitor sees in the box.
  // The result is still validated like anything typed; an invalid paste is shown as an error, not accepted.
  function fromPaste(text) {
    var p = normalize(text);
    if (/^\+?91[0-9]{10}$/.test(p)) return p.replace(/^\+?91/, '');
    if (/^0[0-9]{10}$/.test(p)) return p.slice(1);
    return p;
  }

  var api = { PHONE_RE: PHONE_RE, normalize: normalize, error: error, fromPaste: fromPaste };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MBPhone = api;
})(typeof window !== 'undefined' ? window : this);
