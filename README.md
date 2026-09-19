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
