# SEO autopilot (report-and-propose)

A daily job that audits the live site, reads Search Console, scores real opportunities and, only if you switch it on,
prepares **validated patches on a separate git branch** for you to review. It never changes the live site by itself.

## What it will never do

- merge into `main`, push, deploy, or restart PM2 or nginx
- touch `.env`, `data/`, uploads, admin/auth, payroll or deployment configuration (patches are limited to an allow-list of SEO view files, and protected paths are refused in code)
- invent prices, MOQ, delivery times, capacity, certifications, reviews, customers, other locations or private-label/OEM claims
- create new pages (it can only *propose* one in the report, with a checklist; a person writes and approves it)
- claim that Google indexing was forced: sitemap submission, IndexNow and URL Inspection are only submissions and status checks

Stack note: the site is plain Node (no Express) behind nginx, run by PM2. The autopilot is a separate, dependency-free
Node tool in `autopilot/` and does not change that architecture.

## Modes (one setting, no redesign needed later)

| Setting | Meaning |
|---|---|
| `AUTOPILOT_MODE=report` (default) | audit + report + IndexNow/sitemap/URL Inspection. No patches. |
| `AUTOPILOT_MODE=propose` | additionally generates a patch with the AI, validates it, applies it **in a separate git worktree**, runs all quality gates and commits it **only to a branch** `seo-autopilot/<date>-<page>-<id>`. |
| `AUTOPILOT_PUBLISH=auto` | reserved for a future, separately reviewed feature. This build refuses it and reports a stop condition. |

The first run is always audit-only: it builds the inventory, verifies IndexNow and Google access, saves the baseline and
must pass before any proposal is allowed.

## Daily flow

1. Stop checks: the repository must be clean (admin edits to `data/` and uploads are ignored), no protected file modified, no critical audit finding, page count unchanged, IndexNow key valid, Google access working. Any failure means **no proposals** (the audit and report still run).
2. Inventory of the live site (sitemap + crawl): title, description, H1, canonical, robots, words, JSON-LD, links in/out, content hash.
3. Public smoke test (read-only GET requests; optional read-only `pm2 jlist`).
4. Search Console: 28-day window vs the previous 28 days (cached 20 h). Queries are classified (branded, irrelevant, informational, product, commercial), scored, mapped to the best existing page and checked for cannibalisation. Branded and unrelated queries (for example "flourish", "gata") are never opportunities.
5. Real content changes (live content hash differs from the stored baseline): `lastmod` is recorded for that page, the changed URLs go to IndexNow (with the key already deployed in `lib/indexnow.js`) and the sitemap is submitted through the Search Console API.
6. URL Inspection of the important pages (status only, cached 7 days, max 10 per run).
7. Proposal (propose mode only, with an AI configured): the AI receives only the query stats and the page's own text and source block, and must answer with a JSON patch. The patch is rejected unless: the file is on the allow-list and not protected, the "find" text occurs exactly once inside that page's block, it contains no code/markup/URLs, it passes the business-claim validator, and the change is small. It is applied in a throw-away worktree and must pass the gates: changed files, JS syntax, sitemap and robots valid, page count, changed-page checks (200, indexable, canonical, one H1, title and description length), no new critical/high SEO defect, schema valid (no Product, offers, reviews), no 5xx/404, and (by default) the project's `seo-hard-check.sh` and the enquiry tests. A failing gate discards the branch and stops the run.
8. Limits: at most 2 pages per day, a 14-day cooldown per page, and no second proposal for a page while a branch for it is still waiting.
9. Report (JSON, Markdown, HTML) and the audit log, stored outside the web root; 90+ days kept.

## Reliability and operations

**Final status of every run** (printed, stored in the report, the ledger and `last-run.json`):

| Status | Meaning | Exit code |
|---|---|---|
| `success` | everything that was checked is fine | 0 |
| `degraded` | the run completed, but something needs attention (Google/AI/IndexNow/scheduler/critical SEO finding ...); each item has a "What to do" line | 0 (alerted) |
| `failed` | the run could not do its job (site unreachable, crash, watchdog stop) | **1** (systemd shows the unit as failed) |
| `skipped` | autopilot disabled on purpose | 0 |

A run is never reported as `success` when a check could not be performed. Exit code 3 means another run is in progress.

**One run at a time.** The lock is created atomically, so two simultaneous starts cannot both run. A lock left by a dead process, or older than 2 hours, is reclaimed automatically. A watchdog stops any run that exceeds 50 minutes (`AUTOPILOT_RUN_TIMEOUT_MS`) and records it as `failed`.

**Retries and rate limits.** Idempotent requests (page fetches, Search Console queries, token refresh) are retried at most twice, with exponential backoff, only for network errors, HTTP 429 and HTTP 5xx; `Retry-After` is honoured (capped). Other 4xx errors are never retried. Search Console results are cached 20 hours, URL Inspection 7 days (max 10 per run), sitemap and IndexNow submissions happen only for real content changes. IndexNow (Bing and others) is separate from Google; neither is a promise of crawling or indexing.

**Google failures are classified**, so "broken" is never confused with "no traffic":

| Status | Meaning |
|---|---|
| `ok` / `ok_no_data` | connected; `ok_no_data` = healthy API, no rows for the window (new or low-traffic property, or data lag) - not an error |
| `not_configured` | no OAuth values; safe report-only mode |
| `auth_invalid` / `auth_invalid_client` / `auth_error` | refresh token revoked/expired, wrong OAuth client, or Google refused the token request |
| `no_access` / `not_found` | the account cannot see the property, or `AUTOPILOT_GSC_SITE` is wrong |
| `quota` / `network` / `api_error` | rate limit, unreachable, or a Google error (usually temporary) |

Check it any time, without printing a credential: `node autopilot/cli.js verify-google`.

**Run ledger.** `runs.jsonl` (one line per run: id, start/end, duration, checks, actions, stops, errors, final status; trimmed to the last 400+ runs) and `last-run.json` live in the state directory. `node autopilot/cli.js ledger` prints them. Reports, snapshots, cache and audit logs are kept at least 90 days (default 120) and then removed automatically; the service output goes to the systemd journal (rotated by journald).

**Scheduler health.** If a run starts more than 50 hours after the previous one, the report and an alert say a scheduled run was missed. For external monitoring, `node autopilot/cli.js health` exits 0 (healthy), 1 (last run failed) or 4 (no recent run).

**Alerts.** Only through the existing `AUTOPILOT_ALERT_WEBHOOK` (a Slack/Teams/Discord-style `{ "text": ... }` webhook); nothing is sent if it is not set, and no paid service is added. An alert is sent when a run fails, when the set of problems changes, when problems clear (recovery), after 7 days if a problem is still open, when a proposal is created or discarded, or when clicks fall more than 30% against the previous 28 days. The same open problem is not announced again every day. Alert text is redacted and never includes credentials. A failing webhook never fails the run.

**Weekly trend report.** `weekly-YYYY-MM-DD.md/.json` in the reports folder, created on the first run of each week (Monday, India time) from the stored daily reports: 28-day rolling Search Console totals and week-over-week change, pages gaining/losing impressions, rising commercial queries, top opportunities, indexing status of key pages, audit trend, operational problems and proposals. `node autopilot/cli.js weekly` builds it on demand. It contains no ranking or indexing promises.

## Install later (nothing is installed by this repository)

```bash
# on the server, as root; --user is the account that owns /var/www/mamta-bhoj-site
sudo deploy/autopilot/install-autopilot.sh --user deploy --dry-run   # show the plan, change nothing
sudo deploy/autopilot/install-autopilot.sh --user deploy             # install and start the daily timer (report-only)
systemctl list-timers mamta-autopilot.timer
```

The installer creates only `/etc/mamta-autopilot/autopilot.env` (mode 600, from the example), the state directory
`/var/lib/mamta-autopilot`, and two systemd units (a one-shot service and a timer at 03:30 Asia/Kolkata).
Remove it with `sudo deploy/autopilot/uninstall-autopilot.sh` (add `--purge` to delete credentials and state).

## Commands

| Command | What it does |
|---|---|
| `npm run seo:dry-run` | full audit and report; no branch, no submission, no lastmod |
| `npm run seo:auto` | the daily run (what the timer executes) |
| `npm run seo:report` | print the latest report |
| `npm run seo:enable` / `seo:disable` | allow / stop scheduled runs |
| `npm run seo:rollback` | withdraw the latest proposal (deletes its unmerged branch); if you already merged it, prepares a **revert branch** for you to merge |
| `npm run seo:audit-log` | every automatic decision |
| `node autopilot/cli.js baseline` | accept the current live site as the new baseline (after a deliberate manual deploy that added or removed a page) |
| `node autopilot/cli.js status` | mode, state, last run and health, open proposals (no secrets) |
| `node autopilot/cli.js verify-google` | check the Google OAuth values and access to the Search Console property (status + remedy, never a credential) |
| `node autopilot/cli.js ledger` | the run ledger: id, times, checks, actions, errors, final status |
| `node autopilot/cli.js health` | exit code for monitoring: 0 healthy, 1 last run failed, 4 no recent run |
| `node autopilot/cli.js weekly` | build the weekly trend report now |

On the server run them as the service user with the state directory, for example:
`sudo -u deploy AUTOPILOT_STATE_DIR=/var/lib/mamta-autopilot npm run seo:dry-run`

## Reviewing a proposal

```bash
git diff main...seo-autopilot/2026-10-12-wholesale-flour-supplier-ab12cd    # what changes
git merge --no-ff seo-autopilot/2026-10-12-wholesale-flour-supplier-ab12cd  # only if you approve
# then deploy with your normal manual process; delete the branch afterwards
```

## Credentials (the only unavoidable one-time setup)

All optional; without them the autopilot still audits and reports.

- **Google Search Console (OAuth 2.0)**: create an OAuth client in Google Cloud, enable the *Search Console API*, authorise the Google account that owns `sc-domain:devmamflourishfoods.com` once, and store `AUTOPILOT_GOOGLE_CLIENT_ID`, `AUTOPILOT_GOOGLE_CLIENT_SECRET` and `AUTOPILOT_GOOGLE_REFRESH_TOKEN` in `/etc/mamta-autopilot/autopilot.env`. The `webmasters` scope is needed to submit the sitemap; `webmasters.readonly` is enough for reports and URL Inspection.
- **AI provider (only for proposals)**: `AUTOPILOT_AI_MODE=openai|anthropic|claude-cli` plus base URL, model and key. The model never receives `.env`, credentials, customer data, admin data, payroll data, uploads or `data/`.
- **Sitemap lastmod**: set `SEO_LASTMOD_FILE=/var/lib/mamta-autopilot/lastmod.json` in the website's own environment (the one PM2 uses) so the sitemap serves the dates the autopilot records. Without it the sitemap simply has no `<lastmod>`. Dates are only written for real content changes, and invalid or future dates are ignored.

Never commit the env file or any credential. Logs, reports and the audit log redact secret values.

## Tests

`npm run test:autopilot` runs the whole thing against fake Google, a fake AI, a fake IndexNow endpoint and a throw-away git
repository with its own live site: unit tests (claims, classification, patch validation, lastmod, limits, retention,
redaction), a dry run, a full proposal, rejected and gate-failing patches, rollback (unmerged and merged), stop conditions,
daily limits and cooldowns, real-change detection with lastmod / IndexNow / sitemap submission, URL Inspection caching,
enable/disable, timeouts and failures, and the installer. `node scripts/test-autopilot.js --full` also runs the project's real
SEO hard check and enquiry tests as gates. Scenario `E13` covers operations: every Google failure class and zero-traffic handling, retries and rate limits, status and exit codes, the ledger, the watchdog, duplicate-run locking (including two simultaneous starts), alerts (quiet, recovery, redaction, failing webhook), and the weekly report.
On Windows, two installer checks (service user, file mode 600) cannot pass; they pass on Linux.

## Known limits

- New pages are never created automatically (a proposal checklist is reported instead).
- Search Console data lags about three days and low-traffic sites have few queries; the report says so when there is nothing to act on.
- The AI is optional; without it, patch generation is report-only. A configured but incomplete or failing AI is reported (degraded) and never blocks the audits.
- Automatic remediation is limited to the validated patch pipeline on a separate branch. There is no deterministic auto-fixer yet: the audit currently finds nothing that can be fixed provably safely without a person, so none was invented. Content publishing, redirects, robots/canonical changes, schema claims and template changes stay manual.
- Nothing deploys: merging, pushing and restarting remain manual (`AUTOPILOT_PUBLISH=auto` is refused). If a safe deployment cannot be established the autopilot's answer is a reviewable branch plus a report, never a deployment.
