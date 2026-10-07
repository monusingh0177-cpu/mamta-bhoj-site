'use strict';
// IndexNow (Bing, Yandex and other participating engines) ownership key.
// An IndexNow key is a PUBLIC value by design: the protocol requires it to be served
// from the site root so engines can confirm you control the host. It is not a secret
// and grants no access to anything. It is served by routes/public.js at
// /<key>.txt (the file body is exactly the key) and used by scripts/indexnow-submit.js.
// IndexNow is only a change notification for Bing and other participants; it has no
// effect on Google Search.
const INDEXNOW_KEY = 'f6842fb12bae12fa31a927823b2d8f35';
const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;

module.exports = { INDEXNOW_KEY, INDEXNOW_KEY_PATH };
