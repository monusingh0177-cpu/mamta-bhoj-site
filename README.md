# Mamta Bhoj — Website + Admin Panel

Full website for **Devmam Flourish Foods LLP** (brand: **Mamta Bhoj**), with a
built-in admin panel so anyone on your team can update text, product photos,
gallery photos and see enquiry form submissions — no coding required.

This is a complete, self-contained Node.js application: frontend and backend
in one project, **zero npm packages required**. It only uses Node.js's
built-in modules, so it will run on almost any host by just running
`node server.js` — nothing to `npm install`, nothing that can fail to
compile on cheap shared hosting.

---

## 1. Running it locally (to preview before going live)

You need Node.js 18 or newer installed.

```bash
cd mamta-bhoj-site
node server.js
```

Then open:
- Website: http://localhost:3000
- Admin panel: http://localhost:3000/admin/login

To use a different port: `PORT=8080 node server.js`

### Default admin login

A default admin account ships with the project (see `data/admin.json`), with
its username set to `admin`. **Do not look for or commit the plaintext
password anywhere** — only its salted `scrypt` hash is stored on disk, and
that hash cannot be reversed to recover the password.

Ask whoever set up this deployment for the initial credentials out of band
(chat, password manager, etc.) — never over email or in a committed file.

**Change the password immediately after your first login** — go to
`Admin → Settings` and set a new username/password. Whoever you give this
login to (your employee) will be able to edit site text, products, gallery
photos and view contact-form enquiries, so treat it like any other work
password.

---

## 2. What the admin panel can do

Once logged in at `/admin`:

- **Site Content** — edit every piece of text on the Home, About, Quality and
  Contact pages (headline, paragraphs, process steps, address, phone, email,
  FSSAI number) through simple text boxes.
- **Products** — add, edit, delete products; upload a product photo directly
  from the browser (drag no needed, just "Choose File"); mark one product as
  "Featured" so it's highlighted on the Home page.
- **Gallery** — add, edit, delete gallery photos with captions. Until a real
  photo is uploaded for a slot, a themed illustration is shown instead, so
  the site never looks broken or empty.
- **Enquiries** — every Contact page submission is saved here (name, phone,
  enquiry type, message, time received). Mark as read / delete as needed.
- **Settings** — change the admin username and password.

Everything is saved to plain JSON files under `/data` and photos under
`/public/uploads` — no database server to install or maintain.

**Back up the `data/` and `public/uploads/` folders regularly** (or put the
whole project folder under version control / a backup tool) — that's where
all your content, products and enquiries actually live.

---

## 3. Putting it live on `www.devmamflourishfoods.com`

You need:
1. **A domain** — you already have `devmamflourishfoods.com`.
2. **Hosting that can run Node.js** — this is a real Node.js server (not
   static HTML), so it needs a host that keeps a Node process running.
   Affordable options that work well for a small business site:
   - A basic VPS (Hostinger VPS, DigitalOcean, AWS Lightsail, Contabo) — most
     flexible and cheapest long-term.
   - A managed Node host (Render.com, Railway.app) — easiest to deploy,
     usually has a free/low-cost tier, deploys straight from a Git repo.
   - Shared hosting with "Node.js App" support (some Hostinger/GoDaddy
     plans) — check the host explicitly supports Node.js before buying,
     traditional shared hosting (cPanel-only) usually does **not**.

### Typical VPS deployment (Ubuntu example)

```bash
# on the server
sudo apt update && sudo apt install -y nodejs npm nginx
# copy the mamta-bhoj-site folder onto the server, then:
cd mamta-bhoj-site
npm install -g pm2          # keeps the app running & restarts it if it crashes
PORT=3000 pm2 start server.js --name mamta-bhoj
pm2 save
pm2 startup                 # follow the printed instructions so it survives reboots
```

Then put **nginx** (or Caddy) in front of it as a reverse proxy so the site
answers on port 80/443 with a free HTTPS certificate (Let's Encrypt / Certbot
for nginx, or Caddy does HTTPS automatically). Point your domain's DNS
(an A record) at the server's IP address, and the reverse-proxy config at
`www.devmamflourishfoods.com` → `http://localhost:3000`.

Once it's behind HTTPS, set `FORCE_HTTPS=1` as an environment variable
before starting the app — this marks the login cookie "Secure" so it's only
ever sent over HTTPS.

### Managed host (Render / Railway) — simplest option

This is the recommended path if you don't want to manage a server yourself.

**Getting the code onto GitHub without using Git commands:**
1. Create a free account at [github.com](https://github.com) if you don't
   have one.
2. Click **New repository**, name it e.g. `mamta-bhoj-site`, keep it
   Private, and create it (leave "Add a README" unchecked).
3. On the empty repo's page, click **"uploading an existing file"**.
4. On your computer, open the `mamta-bhoj-site` folder so you can see its
   contents (`server.js`, `lib`, `routes`, `views`, `public`, `data`, etc.)
   — then select all of them and drag them into the GitHub upload page.
   Wait for the upload to finish, then click **Commit changes**.
5. Your code is now on GitHub — this is the repo you'll connect to Render
   or Railway below.

**Option A — Render free tier, ₹0/month, to get a real live link today.**
No credit card needed. This is a genuine, zero-cost option — good for
letting your partner (or anyone) open the real, working site right now.
The one thing to know: this app has no external database, it stores
everything (site content, products, enquiries, uploaded photos, admin
password) as plain files on disk, and Render's **free** tier gives every
service an *ephemeral* filesystem — it sleeps after 15 minutes with no
visitors and wakes back up in about a minute when someone visits, but
**any local file changes made since the last sleep/restart are wiped**
(confirmed directly from Render's own docs). In practice that means: the
site itself, browsing, and even submitting the contact form all work
completely normally in the moment — but any admin edits, enquiries or
newsletter sign-ups can vanish the next time it wakes from sleep, without
warning. That's a fine trade-off for "show it live for now" and costs
nothing; it is *not* fine once you're actually relying on the admin panel
or collecting real enquiries day to day — upgrade to Option B when you
reach that point (just adding a disk + one env var, nothing else changes).

Steps:
1. Push this project to a GitHub repository (see above).
2. On [render.com](https://render.com), sign up free → New → Web Service →
   connect the repo.
3. Start command: `node server.js`. No build command needed. Leave the
   instance type as **Free**.
4. You'll get a live URL like `mamta-bhoj.onrender.com` in 2–3 minutes —
   share that with your partner directly, no Claude account needed.
5. Optional: add your custom domain (`www.devmamflourishfoods.com`) under
   Settings → Custom Domains once you're happy with how it looks (this
   still works on the free tier).

**Option B — a small paid plan with a persistent disk, for when this
becomes the real, permanently-live site.** A small paid plan with a
persistent disk/volume avoids the data-loss issue above entirely and
costs about $5–7.25/month:

- **Railway — Hobby plan ($5/month)**: includes a persistent volume by
  default, so this is the simplest option.
  1. Push this project to a GitHub repository (or use Railway's "Deploy
     from GitHub" after uploading the code there — see the GitHub step
     below if you're not familiar with Git).
  2. On [railway.com](https://railway.com), create a new project → "Deploy
     from GitHub repo" → select this repo → Railway auto-detects Node.js.
  3. Add a **Volume** to the service (Settings → Volumes), mount path
     `/data`.
  4. Add environment variables: `PERSIST_DIR=/data` and `FORCE_HTTPS=1`
     (marks the admin login cookie "Secure" — safe since Railway serves
     everything over HTTPS).
  5. Start command: `node server.js` (usually auto-detected).
  6. Once deployed, add your custom domain (`www.devmamflourishfoods.com`)
     under Settings → Networking → Custom Domain, and follow the CNAME
     instructions shown there.

- **Render — Starter plan ($7/month) + a small disk (~$0.25/GB/month)**:
  1. Push this project to a GitHub repository.
  2. On [render.com](https://render.com), New → Web Service → connect the
     repo → choose the **Starter** instance type (not Free).
  3. Start command: `node server.js`. No build command needed.
  4. Add a **Disk** (in the service's Disks tab), mount path `/data`,
     1 GB is plenty.
  5. Add environment variables: `PERSIST_DIR=/data` and `FORCE_HTTPS=1`.
  6. Add a custom domain (`www.devmamflourishfoods.com`) in Settings →
     Custom Domains, and follow the DNS instructions (usually a CNAME
     record) shown there.

On the very first boot with `PERSIST_DIR` set, the app automatically
copies its starter content (homepage text, products, the default admin
login) onto the empty disk — you'll see a line like `Seeding /data from
bundled starter data` in the deploy logs. After that, everything you edit
through the admin panel lives on that disk and survives restarts and
redeploys.

If you don't use `PERSIST_DIR` on a host with an ephemeral filesystem, the
site will still come up and look fine right after each deploy, but any
admin edits, new enquiries or newsletter signups made since the last
restart/redeploy/sleep cycle will be lost without warning — the app logs
`Persistent storage: OFF` at startup as a reminder.

Either way, HTTPS is handled automatically by these platforms once your
custom domain is added.

**If you'd rather not touch Git/GitHub at all:** a basic VPS (below) lets
you literally copy the folder onto the server (e.g. with an SFTP app like
FileZilla) instead of using GitHub — trading "no Git needed" for "you
manage updates and HTTPS yourself."

---

## 4. Adding email notifications for new enquiries (optional, later)

Right now, every Contact form submission is saved and visible in
`Admin → Enquiries`. If you'd also like an email sent to your inbox the
moment someone submits the form, that needs an email-sending library
(e.g. `nodemailer`), which needs `npm install` — not possible from the
sandbox this project was built in, but works fine once this is on your own
server with normal internet access:

```bash
npm install nodemailer
```

Then wire it up in `routes/public.js` inside the `router.post('/contact', ...)`
handler, right after `store.insertRow('enquiries', ...)`. Ask any Node.js
developer to do this in under an hour if you'd rather not do it yourself.

---

## 5. Project structure

```
mamta-bhoj-site/
├── server.js              # entry point — the whole app starts here
├── lib/                    # core building blocks (routing, sessions, storage, icons)
├── routes/                 # public.js (website) and admin.js (admin panel)
├── views/                  # page templates (plain JS functions returning HTML)
├── public/                 # css, js, and uploaded photos — served directly
│   ├── css/style.css       # public site design
│   ├── css/admin.css       # admin panel design
│   └── uploads/            # product & gallery photos live here
└── data/                   # your content — JSON files, no database needed
    ├── content.json        # editable text
    ├── products.json
    ├── gallery.json
    ├── enquiries.json      # contact form submissions
    └── admin.json          # admin login (hashed password)
```

---

## 6. Design

Colours, typography (Fraunces + Work Sans) and the chakki-wheel motif are
taken directly from the Mamta Bhoj packet artwork, so the website and the
product packaging feel like one brand. All illustrations (hero, about,
gallery placeholders) are hand-drawn inline SVG — no stock photography — so
the whole site loads fast and nothing depends on a third-party image host.
Replace them with real mill/facility photography any time via the admin
panel's Gallery section.

---

## 7. Safe deployment & SEO health checks

Two helper scripts live in `scripts/`. Neither is used by the running app,
and neither ever changes production data, uploads, `.env`, the mailer, or
admin/auth code.

### SEO health check (read-only)

```bash
scripts/seo-health-check.sh --local 3000          # a local copy (npm start)
scripts/seo-health-check.sh                       # the live site (https://devmamflourishfoods.com)
scripts/seo-health-check.sh --base-url https://staging.example --verbose
```

Only sends GET/HEAD requests. Checks robots.txt, sitemap.xml, canonicals,
titles/descriptions, one H1 per page, Open Graph/Twitter tags, image alt text,
JSON-LD validity (no fabricated prices/ratings/offers), the business address,
banned claims, pack sizes, redirects (www, trailing slash, legacy slugs),
404 noindex, that private files are not exposed, and internal links.
Canonicals must always point at the production origin, even for a local run.
Options: `--expect-urls N`, `--skip-links`, `--timeout S`, `--no-color`.
Exit codes: `0` pass, `1` failures, `2` usage / site unreachable.

### Mamta Bhoj production configuration

| Setting | Value |
|---|---|
| App path on the server | `DEPLOY_PATH=/var/www/mamta-bhoj-site` (script default) |
| Branch | `main` (script default; anything else needs `--allow-non-main`) |
| Restart command | `DEPLOY_RESTART_CMD="pm2 restart mamta-bhoj"` (script default) |
| Restart shell | `DEPLOY_RESTART_SHELL=login` (default: `bash -lc`, so a `pm2` installed under nvm or a user prefix is found) |
| Backups | `DEPLOY_BACKUP_DIR`, default `~/mamta-bhoj-backups` of the deploy user |
| Config file | `~/.config/mamta-bhoj/deploy.env` on the machine you deploy **from**, `chmod 600`, never committed |

`deploy.env` (host and user are the only things you must provide):

```
DEPLOY_HOST=your.server.example
DEPLOY_USER=deploy
# Defaults, only set to override:
# DEPLOY_PATH=/var/www/mamta-bhoj-site
# DEPLOY_RESTART_CMD=pm2 restart mamta-bhoj
# DEPLOY_BACKUP_DIR=/var/backups/mamta-bhoj     # must already exist and be writable by the deploy user
# DEPLOY_PERSIST_DIR=/var/data                  # only if the app uses PERSIST_DIR
# DEPLOY_HEALTH_URL=https://devmamflourishfoods.com
```

Backups: the script does **not** assume it can write next to the app. The
default is `~/mamta-bhoj-backups` of the deploy user, created with mode 700
(files are 600). To use a system location such as `/var/backups/mamta-bhoj`,
create it once yourself with the right owner and set `DEPLOY_BACKUP_DIR`.
Before it changes anything the script checks the backup directory is writable
and outside the app checkout, and that the restart program is found on the
server; otherwise it stops with nothing changed.

PM2 note: non-interactive ssh sessions often lack the PATH that your login
shell has. The restart runs through a login shell for that reason, and the
script verifies `pm2` is found before deploying. If it is still not found, use
an absolute path (`DEPLOY_RESTART_CMD="/usr/bin/pm2 restart mamta-bhoj"`) or
fix the server's login profile. `DEPLOY_RESTART_CMD` and `DEPLOY_SSH` are
**trusted operator input**: they are executed as written, so take them only
from your own environment or `deploy.env`. Do not put passwords or tokens in
them (they are printed, and hidden with a warning if they look sensitive);
keep app secrets in the server's environment or PM2 ecosystem file.

### Commands

```bash
# 1. Always first: runs the local checks and PRINTS every remote command, executes nothing remotely
scripts/deploy-production.sh --dry-run

# 2. Production deploy (asks you to type the server name; main must be clean and pushed)
scripts/deploy-production.sh

# 3. Verify the live site at any time (read-only)
scripts/seo-health-check.sh

# Rollback: preview, then execute
scripts/deploy-production.sh --rollback <commit-sha> --dry-run
scripts/deploy-production.sh --rollback <commit-sha>
```

What a deploy does, in order: local pre-flight (on `main`, clean tree, pushed
to origin, syntax checks, secret scan, no sensitive files tracked) -> isolated
smoke test of `HEAD` plus the SEO health check -> server inspection (clean
checkout, restart program found, backup directory writable) -> timestamped
backup of `data/` and `public/uploads/` -> fetch + fast-forward check +
protected-path guard -> `git merge --ff-only` -> `npm ci` only if package files
changed -> restart -> live SEO verification. The app is never restarted unless
every earlier step succeeded.

Safety guarantees:
- **Protected paths** (`data/`, `public/uploads/`, `.env*`, mailer, admin/auth,
  session and store code): a deploy **or rollback** whose diff touches them is
  refused, naming the files, before any backup or change. The only way past is
  the explicit `--allow-protected-changes`, which is reported as a warning.
- **Dirty server checkout**: uncommitted changes to tracked code files on the
  server are refused. Admin edits in `data/` and uploads are expected, kept,
  and never overwritten (git refuses a merge/reset that would touch them).
- **Never** `reset --hard`, `clean`, `rm -rf`, force-push or `rsync --delete`.
- **Rollback** uses `git reset --keep`, only to an ancestor of the server's
  commit, after the guard and a backup. If package files differ it runs
  `npm ci` **before** restarting; if `npm ci` fails the app is not restarted.
  Rolling back past SEO fixes will fail the live check; that is expected.
- **Failed live check after the restart**: the script prints diagnostics (HTTP
  probes, server commit and status, and for pm2 a `pm2 describe` plus the last
  20 error-log lines, with obvious secrets masked), the failure, and the exact
  rollback command. It never rolls back by itself.
- **Skip flags**: `--skip-local-tests` and `--skip-post-check` remain, and are
  reported as `SAFETY VALIDATION BYPASSED` at the start, at the step, and in
  the final summary.
- **Inputs**: host, user, remote name, branch, `--base`, SHAs, paths and URLs are
  validated (no leading `-`) and shell-quoted; ssh is called with `--` before
  `user@host`.
- **Logs and secrets**: logs (in `$TMPDIR`, default `/tmp`) and backups are
  mode 600/700; the config file is flagged if group- or world-accessible; secret
  scan hits are redacted; the script refuses to run under `set -x`.

Exit codes: `0` ok, `1` stopped (a check or step failed), `2` usage/config error.
