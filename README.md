# Spinestack

Type a film or a book, get its real spine, put it on a shelf, save the shelf as an Instagram story.

```
index.html            the website (GitHub Pages serves this)
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

At this point uploads, spine cutting from scans, the shelf and story export all work. Search by name needs step 2.

## Worker (what the live site uses)

A free Cloudflare Worker in `worker/` does the parts a static page can't: it looks titles up on TMDB and
Open Library, finds DVD and book scans with the Brave Image Search API, and passes scan images through with
CORS so the page can cut the spine out of them in the browser (`findSpine()` in `index.html`).
The TMDB and Brave keys live only in the Worker, as secrets.

| Endpoint | What it returns |
|---|---|
| `/identify?q=&want=all\|movie\|book` | `{results:[{kind,title,year,creator,cover}]}` |
| `/scans?title=&year=&kind=movie\|book&creator=` | up to 10 wrap-shaped scans whose page names the title: `{results:[{img,source,title,width,height}]}` |
| `/img?url=` | the image, with CORS. http(s) and `image/*` only, 8 MB max, private addresses blocked, 3 redirects max |

CORS is open only to `https://reflexgod.github.io` and `http://localhost:8080`. `/identify` and `/scans`
are cached in Workers KV for 30 days (so each title costs one Brave search), images are cached 30 days,
and each visitor is limited to about 30 searches and 150 images a minute.

### Set up once

In `worker/`:

1. `npm install`
2. `npx wrangler login` and click Allow in the browser.
3. `npx wrangler kv namespace create SPINE_CACHE`, then put the id it prints into `wrangler.toml`.
4. `npx wrangler secret put TMDB_TOKEN` and paste the TMDB "API Read Access Token" (themoviedb.org → Settings → API).
5. `npx wrangler secret put BRAVE_API_KEY` and paste the Brave Search API key (api-dashboard.search.brave.com).
6. `npx wrangler deploy`. It prints the Worker address, e.g. `https://spinestack.NAME.workers.dev`.
7. In `index.html`, set `window.SPINESTACK_WORKER` to that address and keep `window.SPINESTACK_TMDB` empty.

### Update

`cd worker && npx wrangler deploy`. Secrets and the KV cache stay as they are. If you change how `/scans`
filters results, bump the `sc…:` cache key prefix in `src/index.js` so old cached answers aren't reused.

### How a real spine is found

1. The Worker asks Brave for `"<title>" <year> dvd cover` and `<title> dvd cover scan` (books: `"<title>" <author> book cover spine`, `<title> <author> full cover wrap`).
2. It keeps images shaped like a wrap (1.3–1.8 wide for films, 1.2–2.4 for books) whose title or address contains the whole title; one-word titles also need the year or director.
3. The page loads each scan through `/img`, and `findSpine()` looks for the strip between back and front: two clear edges near the middle, about 5 % wide for a DVD, lettering on it, an even colour down it. Photos of open cases and books on a table are turned down.
4. Each cut gets a score from 0 to 100. A film's best cut goes on the shelf by itself at 60 or more; books always let you pick. Cuts under 45 aren't shown.
5. With no good scan, the page falls back to a spine made from the poster or cover.

## 2. Run the backend (optional, not used right now)

The backend has to run on a real server; GitHub Pages can't run it.

On your laptop first:

1. Install Docker Desktop.
2. In `backend/`, copy `.env.example` to `.env`. Add your TMDB key if you have one.
3. In `backend/searxng/settings.yml`, replace `change-me-to-a-long-random-string` with any long random text.
4. In `backend/` run `docker compose up --build`.
5. Open http://localhost:8000 — the backend serves the website too, with search working.

Online, for free: an Oracle Cloud "Always Free" VM.

1. Create the VM (Ubuntu), install Docker, copy this repo onto it.
2. Do steps 2–4 above. In `.env` set `ALLOWED_ORIGINS=https://YOURNAME.github.io`.
3. The GitHub Pages site is HTTPS, so the backend must be HTTPS too. Point a domain or free subdomain at the VM and put Caddy in front of port 8000 (Caddy gets the certificate automatically).
4. In `index.html`, set `window.SPINESTACK_API = "https://your-backend-address";`, commit, and GitHub Pages picks it up.

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
