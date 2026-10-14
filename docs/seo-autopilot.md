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
| `AUTOPILOT_MODE=auto` | everything `propose` does, **and** publishes the eligible fixes without approval: gates -> fast-forward -> restart -> live verification -> push, with automatic rollback (see "Automatic publishing" below). Needs `AUTOPILOT_RESTART_CMD`, extra write access **and an activation** (`node autopilot/cli.js activate-auto`, which runs the readiness checks); until all exist it behaves like `propose` and says exactly what is missing in the report. |
| `AUTOPILOT_PUBLISH=auto` | **not a switch.** It is refused and reported as a stop condition; use `AUTOPILOT_MODE=auto`. |

`propose` and `auto` also run the deterministic fixer (no AI needed) described below. Every mode is report-only for the very first run and for `dry-run`.

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

## Automatic remediation and publishing

**Discovery -> proposal.** `lib/fixers.js` turns facts into patches without an AI. Implemented fixer, `related-link`: a guide with fewer internal links pointing to it than `AUTOPILOT_MIN_INLINKS` (audit finding `few-inlinks`, default 3), or the best page for a rising commercial query with fewer than `AUTOPILOT_OPPORTUNITY_INLINKS` (default 5), is added to the `related: [...]` list of the most topically close guide (shared product topic) that does not link to it yet. That list renders real `<a href>` links. The patch appends exactly one existing guide slug, never exceeds 5 entries, and is checked by `patch.validate` (allow-listed file, inside that guide's block, slug exists, no self link, nothing removed, claims check). No new wording is created. One fix per day by default (`AUTOPILOT_MAX_FIXES_PER_DAY`), per-page and per-target cooldown (`AUTOPILOT_COOLDOWN_DAYS`), nothing is re-applied.

**Proposal -> gates.** The patch is applied in an isolated git worktree and must pass every gate (allow-listed unprotected files only, syntax, rendered preview, sitemap/robots, page count, no new critical/high audit defect, schema, the project's SEO hard check and enquiry tests). A failing fix is discarded and nothing is applied.

**Gates -> publication (`AUTOPILOT_MODE=auto` only).** `lib/publish.js`:

1. *preflight* - production checkout on `main`, tracked tree clean (`data/` and uploads are ignored, so the server's modified `data/admin.json` and its backups never block and are never touched), `git fetch` and `HEAD == origin/main`, the fix is exactly one commit on top of `HEAD`, 1-3 files, all allow-listed and none protected (`data/`, uploads, `.env*`, auth, session, mailer, admin, middleware, payroll). Any failure: nothing changes, the fix stays a review branch.
2. *merge* - `git merge --ff-only` (never reset/clean/stash).
3. *restart* - `AUTOPILOT_RESTART_CMD`.
4. *verify-live* - the site answers, the public smoke test passes, the changed page really contains the new link, no new critical/high audit defect on the live site, and (when `AUTOPILOT_GATE_HARDCHECK` is on) `scripts/seo-health-check.sh` passes against the live URL.
5. *push* - `git push origin <sha>:main`, so GitHub only ever receives a commit that was verified live.

Then the changed URL is submitted to IndexNow and the sitemap to Google as before (a submission, not a promise of crawling or indexing).

**Failure -> rollback.** If merge, restart, live verification or push fails, `git reset --keep <previous commit>` (refuses to overwrite local edits), restart, verify the old site is serving. The run is `degraded` with a "release rolled back" item and an alert, **publishing is paused** (circuit breaker) until a person has looked and run `node autopilot/cli.js resume-auto`, and while paused fixes are only prepared as review branches. If the rollback itself fails, the run is `failed` (exit 1) with a "fail" item and an alert. Releases per day: `AUTOPILOT_AUTO_MAX_PER_DAY` (default 1).

**Change ledger.** Every attempted change (published, rolled back, rejected, left as a proposal) is appended to `changes.jsonl` in the state directory: old value, new value, file, finding/opportunity that caused it, proposal commit, previous production commit, released commit, every verification step, and the rollback outcome. `node autopilot/cli.js changes` prints it, and the weekly report summarises it.

**Trace.** Each fix records `discover, propose, gates, preflight, merge, restart, verify-live, push` (or the rollback steps) in the report, the audit log and the ledger. `node autopilot/cli.js ledger` and the daily report show the whole path.

**Activation (the explicit switch).** Setting `AUTOPILOT_MODE=auto` is not enough. `node autopilot/cli.js activate-auto` must pass these checks as the unprivileged service user and then records an activation (`auto-activation.json` in the state directory, bound to the repository path, release branch, remote and the exact restart command, so changing any of them silently de-activates publishing): configuration complete; **not running as root**; on the release branch; tracked tree clean; HEAD == `origin/main`; `git push --dry-run` accepted (credentials and branch rules); `views/`, `.git` and the state directory writable; the restart command exists on PATH; the live site passes the public smoke test. `--test-restart` also runs the restart command once (a real, brief restart). `deactivate-auto` removes it at once. Failing checks print what to fix and nothing is recorded.

**What must exist on the server before `AUTOPILOT_MODE=auto` can work** (none of it is done by this repository; the report says "Automatic publishing is not active" with the reason until it is):

- `AUTOPILOT_RESTART_CMD` in `/etc/mamta-autopilot/autopilot.env` (e.g. `pm2 restart mamta-bhoj`), runnable by the service user. PM2 is per-user: the service user must be the user whose PM2 runs the site.
- Write access. `install-autopilot.sh --user <service user> --auto-publish` installs the drop-in below (`deploy/autopilot/auto-publish.conf`; it grants write access only and does not switch the mode). The unit keeps the file system read-only (`ProtectSystem=strict`, writable: state dir and `<repo>/.git`). Publishing also needs a drop-in granting exactly two more paths: the SEO view files and the service user's PM2 home. Review and install it yourself, for example `/etc/systemd/system/mamta-autopilot.service.d/auto-publish.conf`:
  ```
  [Service]
  ReadWritePaths=<repo>/views /home/<service-user>/.pm2
  ```
  then `sudo systemctl daemon-reload`. `data/`, `public/uploads/`, `.env`, `routes/`, `lib/` and `middleware/` remain read-only to the service.
- Git credentials for `git fetch` and `git push origin main` as the service user (a read/write deploy key limited to this repository, with the GitHub host already in `known_hosts`). Branch protection that forbids direct pushes to `main` will make the push step fail, which rolls the release back; if you use it, allow this one key to push or stay on `propose`.
- If the site's PM2 daemon runs under a different account than the service user, `deploy/autopilot/sudoers-restart.example` shows a sudoers entry that allows exactly one command (`pm2 restart mamta-bhoj`) and nothing else; validate it with `visudo -cf`. Note `NoNewPrivileges=true` in the unit blocks sudo, so the simplest correct setup is the same account for PM2 and the autopilot.
- The production checkout must sit at `origin/main`. After any manual deployment that is already true; if someone commits on the server only, the autopilot refuses to publish and says why.

Recommended order: `report` -> check a few days of reports -> `propose` (look at the branches) -> `auto`. Roll back to `report` by editing one line.

## Target keywords, query movement, Google indexing status, Semrush

**The 19 commercial target keywords** are version-controlled in `autopilot/target-keywords.txt` (one per line, `#` comments; change them with a pull request). `AUTOPILOT_TARGET_KEYWORDS_FILE` points at it (set in the environment template to `/var/www/mamta-bhoj-site/autopilot/target-keywords.txt`); an empty value switches tracking off. For every keyword the daily report gives, from authenticated Search Console data only:

- the **matching queries** (queries containing every word of the keyword, so "flour manufacturer in India" counts for "flour manufacturer India"), with impressions, clicks, CTR-relevant totals and impression-weighted position for the settled 28 days against the previous 28 (the window ends three days before the run), plus the exact-query totals;
- the **page Google shows** for it and the **page that fits it best** (from the site's own text; a supply keyword is mapped to a supply page, and a guide that fits better is reported, not chosen). A difference is reported as a **page mismatch**;
- a **content coverage** verdict (good / weak / none). "None" is a content gap for a person to review: the autopilot never creates a page for a keyword;
- the states are kept apart: measured values, `no impressions` (Search Console answered; a real zero) and `UNAVAILABLE` (the data could not be read; never shown as zero).

Opportunity analysis recognises the target keywords (a flag and a modest score boost). Queries that had visibility in the previous window and none now are listed only when both windows have data.

**Sitemap and indexing monitoring** (read-only, when Search Console is connected): the sitemap's status as Google reports it (last downloaded, errors, warnings, submitted vs indexed counts, or "Google has no record of it"), and **indexing discrepancies** between URL Inspection and the site (indexable but not indexed, Google chose another canonical, robots blocked, fetch problem). They are status facts and never promise that a change will get a page indexed. The sitemap is submitted after real content changes only, and IndexNow is a separate notification channel for participating engines, not Google.

**Technical audit** additionally detects: og:url disagreeing with the canonical, meta robots versus X-Robots-Tag conflicts, indexable pages missing from the sitemap, sitemap URLs that redirect, a robots.txt Sitemap line that is missing or points elsewhere (besides duplicate/missing/wrong titles, descriptions, canonicals, noindex-in-sitemap, structured data, broken internal links and thin linking).

**Semrush (optional, `AUTOPILOT_SEMRUSH_API_KEY`)** adds *estimated monthly search volume* per keyword. States: `not_configured` (nothing asked), `ok` (a number, or "none recorded" when Semrush answers "NOTHING FOUND", a genuine absence), `no_units` (no API units: **not** a zero, shown as "NOT MEASURED", and the batch stops), `auth_invalid`, `rate_limited`, `network`. Results are cached for 7 days so units are not spent twice. It is market data, never a ranking or an impression count. **Not verified against a live Semrush account**: the request and the "ERROR nn :: text" classification follow Semrush's documented convention and are tested with fixtures only.

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
| `node autopilot/cli.js resume-auto` | clear the automatic-publishing pause that follows a rolled-back release |
| `node autopilot/cli.js activate-auto [--test-restart]` | run every readiness check; only if all pass, record the activation that automatic publishing requires |
| `node autopilot/cli.js deactivate-auto` | remove the activation (automatic publishing stops immediately) |
| `node autopilot/cli.js changes` | the change ledger: old/new value, commits, verification, rollback |

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
Scenario `E15` covers the activation gate (every readiness failure, the binding to the configuration), the change ledger and weekly summary, the new audits, Search Console sitemap/indexing monitoring, the 19 keywords (file, matching, coverage, mismatch, unavailable vs zero) and Semrush (not configured / ok / no data / no units / bad key / rate limit / network). Scenario `E14` covers automatic remediation end to end against a throw-away repository with a real bare `origin`: fix proposed without an AI, published and verified live, the full step trace, `data/admin.json` preserved byte for byte, rollback when live verification fails / the site is down / the restart command fails / the push is rejected / the rollback itself fails, the circuit breaker and `resume-auto`, idempotence across days, the protected-path and clean-tree guards, misconfiguration, AI changes never auto-publishing, patch validation, and target-keyword handling.
Platform notes: the installer scenario renders and verifies the systemd units everywhere. The POSIX-only assertions (the credentials file really is mode 600, `systemd-analyze verify`, and the one-shot run as the configured service account) are reported as `SKIP` with the reason on a platform that cannot test them (Windows, or a machine without systemd) and asserted on Linux; the final line prints passed, failed and skipped counts. `.github/workflows/autopilot-tests.yml` runs the whole suite plus the secret-scan and shell-syntax checks on Linux for every pull request. The installer refuses `--user root` and, for a real install, any path that would break the systemd unit.

## Known limits

- New pages are never created automatically (a proposal checklist is reported instead).
- Search Console data lags about three days and low-traffic sites have few queries; the report says so when there is nothing to act on.
- The AI is optional; without it, patch generation is report-only. A configured but incomplete or failing AI is reported (degraded) and never blocks the audits.
- The only automatically **publishable** fix is the internal-link fixer (below). Title/description wording, body copy, new pages, redirects, robots/canonical changes, schema claims and template changes need business facts or judgement, so they stay with the AI proposal path (always a review branch, even in `auto` mode) or with a person. The audit currently finds nothing for the fixer to do on the live site (when this was written every guide had at least 6 internal links; the audit flags fewer than 3), so a healthy site gets no changes: the autopilot does not change pages for the sake of it.
- Publishing happens only in `AUTOPILOT_MODE=auto`, after every gate, on top of the released commit, with live verification and rollback. If a safe release cannot be established the answer is a reviewable branch plus a report.
