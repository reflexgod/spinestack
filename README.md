# shelfstackd

Live at https://shelfstackd.com (this repository and its folders keep the old working name, spinestack).

Type a film or a book, get its real spine, put it on a shelf, save the shelf as an Instagram story.

```
index.html            the home page (GitHub Pages serves this). Signed out: a welcome and the newest public shelves; signed in: new shelves from people you follow. Links to the old builder here (/?open=, /#shelf) go on to build/
build/index.html      the shelf builder: search, the shelf, the story
shelf.js              draws the spines and the story; build/ and u/ both use it, so a shelf looks the same everywhere
u/index.html          profiles: /u/?username, and one shelf: /u/?username&shelf=<id>
feed/index.html       the feed: /feed/, FOLLOWING and EVERYONE, newest saved shelves first
worker-address.js     sends Worker requests to its workers.dev address on networks that block api.shelfstackd.com
admin.html            approve or delete archive uploads (needs the admin token); read reports (Google sign-in, admins only)
worker/               Cloudflare Worker: name lookup, scan search, image proxy (what the live site uses)
backend/              older self-hosted search server (not used right now)
  api/                FastAPI app
  searxng/            your own free search engine, no API key
  docker-compose.yml  runs both with one command
  .env.example        copy to .env for your keys (never commit .env)
```

## 1. Put the website on GitHub Pages

1. Create a new public repository on GitHub, for example `spinestack`.
2. Upload everything in this folder (keep `.gitignore` and `.nojekyll`).
3. Repository → Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)` → Save.
4. After a minute the site is live at `https://YOURNAME.github.io/spinestack/`.
5. The live site has its own domain: `CNAME` holds `shelfstackd.com`, set in Settings → Pages → Custom domain (with
   Enforce HTTPS). Its DNS is on Cloudflare: the four GitHub Pages A records and four AAAA records on the root and `www`
   as a CNAME to `reflexgod.github.io`, all "DNS only" so GitHub can issue the certificate. The old address redirects here.

At this point uploads, spine cutting from scans, the shelf and story export all work. Search by name needs step 2.

## Worker (what the live site uses)

A free Cloudflare Worker in `worker/` does the parts a static page can't: it looks titles up on TMDB and
Open Library, finds DVD and book scans with the Brave Image Search API, and passes scan images through with
CORS so the page can cut the spine out of them in the browser (`findSpine()` in `build/index.html`).
The TMDB and Brave keys live only in the Worker, as secrets.

| Endpoint | What it returns |
|---|---|
| `/identify?q=&want=all\|movie\|book` | `{results:[{kind,title,year,creator,cover}]}` |
| `/scans?title=&year=&kind=movie\|book&creator=&round=0-3` | one Brave search per round: up to 10 wrap-shaped (or single-spine) scans whose page names the title, plus approved archive spines first in round 0: `{results:[...], round, more}` |
| `/img?url=` | the image, with CORS. http(s) and `image/*` only, 8 MB max, private addresses blocked, 3 redirects max |
| `POST /archive?kind=&title=&year=&author=` | a PNG of one spine (300 KB max, at least 3 times taller than wide), re-encoded and kept as *pending* |
| `/archive/img?id=` | an approved archive spine |
| `POST /report?id=` | one report per visitor; the third sends an approved spine back to pending |
| `/admin/list`, `POST /admin/approve`, `POST /admin/delete` | for `admin.html`, with `Authorization: Bearer <ADMIN_TOKEN>` |
| `POST /m/upload?kind=avatar|wall|png` | signed in: a profile photo, a wall or a wall PNG (PNG, JPEG or WebP by its first bytes, 2 MB max) into R2 under a random key; walls and PNGs only for Pro. 20 a minute and 200 a day per account, 20,000 a day in all: `{key}` |
| `/m/img?k=` | one of those pictures |
| `POST /m/delete?k=` | signed in: deletes one of your own pictures, once no shelf of yours and not your profile uses it |

The Worker answers at `https://api.shelfstackd.com` (a custom domain, in `wrangler.toml`). On networks that block that
domain (some college and office Wi-Fi block new domains), a request that fails with a network error is sent again to the
same Worker at its workers.dev address, and the tab keeps using it for the session (`worker-address.js`). So keep
`workers_dev = true`.
CORS is open only to `https://shelfstackd.com`, `https://www.shelfstackd.com`, `https://reflexgod.github.io` and
`http://localhost:8080`. `/identify` and `/scans`
are cached in Workers KV for 30 days (so each title costs one Brave search), images are cached 30 days,
and each visitor is limited to about 30 searches and 150 images a minute.

### Set up once

In `worker/`:

1. `npm install`
2. `npx wrangler login` and click Allow in the browser.
3. `npx wrangler kv namespace create SPINE_CACHE`, then put the id it prints into `wrangler.toml`.
4. `npx wrangler secret put TMDB_TOKEN` and paste the TMDB "API Read Access Token" (themoviedb.org → Settings → API).
5. `npx wrangler secret put BRAVE_API_KEY` and paste the Brave Search API key (api-dashboard.search.brave.com).
   `npx wrangler secret put ADMIN_TOKEN` and paste a long random string of your own. It's the password for `admin.html`; keep it only in a password manager.
6. `npx wrangler deploy`. It prints the Worker address, e.g. `https://spinestack.NAME.workers.dev`.
7. In `index.html`, `build/index.html`, `u/index.html`, `feed/index.html` and `admin.html`, `window.SPINESTACK_WORKER` is the Worker's address
   (`https://api.shelfstackd.com`) and `window.SPINESTACK_WORKER_FALLBACK` its workers.dev address. Keep
   `window.SPINESTACK_TMDB` empty.

### Archive

People can share spines they cut from their own scans: after an upload gives a clean real spine
(score 70 or more), its row on the shelf offers "Add to the archive". Nothing is public until you approve it:

1. Open `https://shelfstackd.com/admin.html`, type the admin token (it stays in that tab only, in sessionStorage).
2. Pending spines are listed with Approve and Delete. Approved ones show up first in search, labelled "From the archive".
3. Anyone can Report an archive spine; three reports from different visitors send it back to Pending.

Limits: 10 uploads a day per visitor and 50 a day in all. The PNGs are in Workers KV; the status, reports and
daily counts are in a small SQLite Durable Object (`Archive` in `src/index.js`), because KV reads can be up to a
minute stale. Both fit the Workers Free plan and need no card.

### Update

`cd worker && npx wrangler deploy`. Secrets and the KV cache stay as they are. If you change how `/scans`
filters results, bump the `sc…:` cache key prefix in `src/index.js` so old cached answers aren't reused.

### How a real spine is found

1. The page asks the Worker for one round at a time, at most 4 per title, and stops once two good spines turn up, to save Brave searches.
   Films: `"<title>" <year> dvd cover`, `"<title>" <year> dvd cover english`, `"<title>" dvd cover scan`, `"<title>" criterion dvd`.
   Books: `"<title>" <author> book cover spine`, `"<title>" <author> book spine`, `"<title>" spine`, `<title> <author> full cover wrap`.
2. It keeps images shaped like a wrap (1.3–1.9 wide for films, 1.2–2.4 for books) or like a single spine (4 times taller than wide), whose title or address contains the whole title; one-word titles also need the year or director.
3. The page loads each scan through `/img`, and `findSpine()` looks for the strip between back and front: two clear edges near the middle, about 5 % wide for a DVD, lettering on it, an even colour down it. Photos of open cases and books on a table are turned down.
4. Each cut gets a score from 0 to 100. A film's best cut goes on the shelf by itself only at 75 or more (in tests right spines scored 76–97 and wrong ones up to 69) **and** when it looks like the English edition; books always let you pick, unless the spine comes from the archive. Cuts under 45 aren't shown, and each page gives one option at most.
   Editions: the Worker marks a scan as another edition when its page title, address or file name has another language or region (Polish, Deutsch, español, français, 日本, region 2, `.pl`/`.de`/… pages, `nl`/`ger`/… in file names) and marks VHS tapes. With **Edition: English** (the default) English DVDs and Blu-rays come first; VHS comes last either way. **Any** drops the language rule.
5. With no good scan, the page falls back to a spine made from the poster or cover.

## Profiles

`/u/?username` (a real file, so GitHub Pages answers 200 and link previews work): photo, name, @username, the numbers,
the featured shelf drawn on its own, recent shelves, bio, most shelved. `/u/?username&shelf=<id>` shows one shelf. The
owner gets Edit profile (photo, name, bio, featured shelf, Private profile). The header's @username and the Profile link
in My shelves lead there; "Open in builder" on your own shelf opens `build/?embed&open=<id>` over the profile.
Private shelves (the tick in My shelves) show only to their owner. A private profile shows others only its photo,
display name and @username; its public shelves show to its owner and the followers it accepted.

## Follows and the feed

FOLLOW on a profile follows a public profile at once and sends a request to a private one (its owner answers under
REQUESTS on their profile). FOLLOWING and FOLLOWERS open the lists, 30 at a time. 100 follows and unfollows an hour
per account, counted in the database. `/feed/` shows public shelves, 20 at a time: EVERYONE from public profiles,
FOLLOWING from the people you follow. A shelf moves up only when it's saved in the builder (`shelves.saved_at`);
renaming it or making it main doesn't. All of it is decided in the database (`0006`), not in the page.

Photos, walls and PNGs live in the R2 bucket `shelfstackd-media` (binding `MEDIA`). Create it once, in `worker/`:
`npx wrangler r2 bucket create shelfstackd-media`, then `npx wrangler deploy`. Keep `USER_R2` commented out: binding it
would hide the shelf images already saved in KV.

## Accounts (Supabase)

Sign in with Google, save shelves, open them again. Everything else on the site works without an account, and
signed-out visitors never load the Supabase library.

- **Where things live:** text rows (profiles, shelves, shelf items) in the Supabase project "shelfstackd"
  (Mumbai, free plan). Images a saved shelf needs, and each shelf's small preview, in the Worker's KV
  (`ub:<user id>/...`); archive spines and TMDB / Open Library covers are pointed at, not copied.
- **Keys:** only the Project URL and the *publishable* key are used, in `index.html`, `build/index.html`, `u/index.html`, `feed/index.html` and in `worker/wrangler.toml`
  `[vars]`. Both are public; Row Level Security protects every table. The secret / service_role key isn't used
  anywhere and must never be added to the page, the repo or the Worker.
- **Database:** run each file in `supabase/migrations/` once, in order, in the dashboard's SQL Editor. Then run the
  test for the newest one (`supabase/tests/rls_phase3.sql` after `0006`): it plays two users and a signed-out visitor,
  undoes everything, and ends with `ALL ... CHECKS PASSED` (or stops at the first `FAIL:`). `rls_phase1.sql` is for a
  database with `0001` only.
- **Pro:** two switches that must agree: `SHELFSTACKD_PRO_REQUIRED` in `build/index.html` (what the page offers) and
  `app_config.pro_required` in the database (what the database and the Worker allow). Both are off, so everyone gets Pro.
  With them on, an account is Pro when `profiles.is_pro` is true (set in the SQL Editor; never from the page).
- **Admins** can read reports. Add yourself once in the SQL Editor:
  `insert into public.admins (user_id) select id from auth.users where email = '<your sign-in email>';`
- **Sign-in addresses:** Supabase → Authentication → URL Configuration: Site URL `https://shelfstackd.com`; it allows
  `https://shelfstackd.com/**`, `https://reflexgod.github.io/spinestack/**` (until the move settles) and `http://localhost:8080/**`. Google's client sends people back to
  `https://fiukspnovrlzlcdekcnb.supabase.co/auth/v1/callback`.
- **Email sign-in** is built but off (`SPINESTACK_EMAIL_LOGIN = false` in `build/index.html`, and the Email provider is
  off in Supabase) until email can be sent from shelfstackd.com.
- **Limits:** 6 spines a shelf (20 with Pro; over 10 they stand in two rows), 200 shelves an account; the Worker saves at most 150 images a day per account and
  600 a day in all (KV's free plan allows 1,000 writes a day). To move images to R2 later, create a bucket and
  uncomment the `USER_R2` binding in `wrangler.toml`; the same keys are used there.
- **Staying awake:** Supabase pauses free projects after a week without activity; the Worker's daily cron
  (03:00 UTC) makes one tiny read so it doesn't.
- **Privacy:** `privacy.html`. Accounts are for people 18 or older.

## 2. Run the backend (optional, not used right now)

The backend has to run on a real server; GitHub Pages can't run it.

On your laptop first:

1. Install Docker Desktop.
2. In `backend/`, copy `.env.example` to `.env`. Add your TMDB key if you have one.
3. In `backend/searxng/settings.yml`, replace `change-me-to-a-long-random-string` with any long random text.
4. In `backend/` run `docker compose up --build`.
5. Open http://localhost:8000 — the backend serves the website too. For its search to be the one the page uses, set
   `window.SPINESTACK_API = "http://localhost:8000";` in `build/index.html` (while it's empty, the page uses the Worker and
   doesn't look for a backend).

Online, for free: an Oracle Cloud "Always Free" VM.

1. Create the VM (Ubuntu), install Docker, copy this repo onto it.
2. Do steps 2–4 above. In `.env` set `ALLOWED_ORIGINS=https://YOURNAME.github.io`.
3. The GitHub Pages site is HTTPS, so the backend must be HTTPS too. Point a domain or free subdomain at the VM and put Caddy in front of port 8000 (Caddy gets the certificate automatically).
4. In `build/index.html`, set `window.SPINESTACK_API = "https://your-backend-address";`, commit, and GitHub Pages picks it up.

## Keys

| What | Needed? | Where |
|---|---|---|
| TMDB API key | Optional, free | themoviedb.org → Settings → API. Adds year and director to film matches. |
| SearXNG | No key | Runs inside Docker. |
| Open Library | No key | Public API. |
| `secret_key` in `searxng/settings.yml` | Make one up | Any long random text. Change it on the server, don't commit the real one. |

Keys go in `backend/.env` only. `.gitignore` already keeps `.env` and `data/` out of GitHub.

## How search works

1. `/api/identify` matches the name on TMDB (films) and Open Library (books).
2. `/api/spines` asks SearXNG for images like `"Gummo" 1997 dvd cover`.
3. Images shaped like a wrap scan (back | spine | front) are downloaded, and the strip between back and front is cut out.
4. Found spines are cached in `backend/data/`, so repeat searches are instant.
5. If no scan has a clean spine, the site offers a spine made from the poster or cover.

## Things to know

- Search engines sometimes rate-limit SearXNG, so results vary. The cache helps more over time.
- Scans are the studios' and publishers' artwork; each spine links to where it was found. To remove one, delete its files in `backend/data/media/` and its row in `backend/data/cache.db`.
- TMDB requires the credit line that's already in the page footer.

## To do

- [x] Phase 2: a Cloudflare Worker to hide the TMDB token. The token now lives only in the Worker (see "Worker" above).
