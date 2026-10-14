# Enquiry form spam protection

All checks run on the server (`routes/public.js` `POST /contact`, `lib/enquiry.js`, `lib/spam-guard.js`).
The browser script (`public/js/phone-validate.js`, `public/js/main.js`) only gives instant feedback.
Genuine enquiries are still saved to `data/enquiries.json` and emailed through the existing ZeptoMail flow.

## Order of checks for each `POST /contact`

1. **Per-IP rate limit** (every POST counts, valid or not) -> HTTP 429 + `Retry-After`.
2. Body parsing (malformed / oversized -> 400 / 413, as before).
3. **Honeypot** field `company_website` filled -> 422, nothing stored, no hint to the sender.
4. **Signed form token** (`form_token`, HMAC of the time the form was served): missing / forged / older than 24 h -> "reload the page";
   submitted sooner than `ENQUIRY_MIN_FILL_MS` (default 3 s) -> "please press Send again in a few seconds" (the same token works a moment later, so quick genuine users and autofill are not lost).
5. **Field validation**: Indian mobile `^[6-9][0-9]{9}$` (spaces / hyphens typed between digits are removed, nothing is truncated), name, enquiry type and product must be from the allowed lists, optional fields stay optional, length caps (name 100, city 120, message 2000), control characters stripped, more than 2 links in the message rejected.
6. **Cloudflare Turnstile** (only if both keys are set) verified with Cloudflare. Checked after validation so a typo does not spend the one-time token.
7. **Duplicate protection**: the same enquiry within 2 minutes is acknowledged but stored/emailed once (existing); the browser also ignores a second click while sending.
8. Save, then email (existing behaviour, unchanged).

## Environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `ENQUIRY_FORM_SECRET` | random per process | Secret for the form token. **Set it in production** (long random string) so forms opened before a restart still work. |
| `ENQUIRY_MIN_FILL_MS` | `3000` | Minimum time between the form being served and submitted. `0` disables the timing part. |
| `ENQUIRY_FORM_MAX_AGE_MS` | `86400000` | Age after which a form token is refused. |
| `ENQUIRY_RATE_LIMIT_MAX` | `8` | POSTs allowed per IP per window. |
| `ENQUIRY_RATE_LIMIT_WINDOW_MS` | `900000` | Window length (15 min). Entries expire; memory is bounded. |
| `ENQUIRY_CLIENT_IP_HEADER` | `x-forwarded-for` | Header the **local reverse proxy** uses for the visitor IP (e.g. `x-real-ip`, or `cf-connecting-ip` behind Cloudflare). Honoured only when the TCP peer is loopback/private, so a direct visitor cannot spoof it. With the default, the right-most `X-Forwarded-For` entry (added by nginx) is used. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | unset | Enable Cloudflare Turnstile. Both are required; with only one, or none, it stays off and a warning is logged at start-up. The secret is never rendered or logged. |
| `TURNSTILE_FAIL_OPEN` | off | Set `1` to accept enquiries when Cloudflare itself is unreachable (logged). Default is to refuse with a friendly "try again" message. A token Cloudflare rejects is always refused. |
| `TURNSTILE_TIMEOUT_MS` / `TURNSTILE_VERIFY_URL` | `5000` / Cloudflare's siteverify URL | Tuning / testing. |

**nginx must pass the client address**, otherwise every visitor shares one rate-limit bucket:
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (and `X-Real-IP $remote_addr;` if you use that header).

## Enabling Turnstile

1. Cloudflare dashboard -> Turnstile -> add the site `devmamflourishfoods.com` (widget mode: Managed) -> copy the site key and secret key.
2. Add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (and `ENQUIRY_FORM_SECRET`) to the server environment / PM2 ecosystem file, restart the app.
3. Reload `/contact`: the widget appears above the Send button. Submit a test enquiry.

## Mobile OTP (not enabled; design for later)

Nothing is forced and no paid dependency is added. `ENQUIRY_OTP_ENABLED=1` without `ENQUIRY_OTP_PROVIDER` only logs a warning; OTP is **not** enforced.
Recommended production design when a provider (MSG91, Twilio Verify, etc.) and DLT-registered templates are available:

1. The form gains a "Verify mobile" step: `POST /contact/otp/send {phone}` (same rate limit, plus per-phone limit e.g. 3 / hour).
2. Server generates a 6-digit code, stores only an HMAC of it with the phone, expiry (5 min) and attempt counter (max 5), and sends it through the provider. Provider key in an environment variable, never logged.
3. `POST /contact/otp/verify {phone, code}` returns a short-lived signed "verified phone" token bound to the phone number.
4. `POST /contact` requires that token when OTP is enabled, and re-checks signature, expiry and that it matches the submitted phone. A client-supplied "verified" flag is never trusted.
5. Provider outage: show the call/email details instead of silently dropping the lead.

## Tests

`npm run test:enquiry-unit` (backend + frontend phone rules, token, honeypot, rate limit, client IP, Turnstile client; no network)
and `npm run test:enquiry` (full HTTP pipeline with fake mail and Cloudflare servers; never touches real data).
