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
| `node autopilot/cli.js status` | mode, state, open proposals (no secrets) |

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
SEO hard check and enquiry tests as gates.

## Known limits

- New pages are never created automatically (a proposal checklist is reported instead).
- Search Console data lags about three days and low-traffic sites have few queries; the report says so when there is nothing to act on.
- The AI is optional; without it, patch generation is report-only.
