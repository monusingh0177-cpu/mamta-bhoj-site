'use strict';
const { getSession } = require('../lib/session');

// Returns the logged-in admin's session data, or null if not authenticated.
function currentAdmin(req) {
  const { data } = getSession(req);
  return data && data.isAdmin ? data : null;
}

module.exports = { currentAdmin };
