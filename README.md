# shelfstackd

Live at https://shelfstackd.com (this repository and its folders keep the old working name, spinestack).

Type a film or a book, get its real spine, put it on your shelf (one each), save it to your profile. From its page the shelf can be shared as an Instagram story. You can also log a film or a book you watched or read, which goes on the feed with its cover, and keep a watchlist.

```
index.html            the home page (GitHub Pages serves this). Signed out: the spine wall (one strip of the newest spines from different public shelves, a few from each person, up to 24, standing on a thin shelf line, each shelf's spines a link to it; 280px tall at most, 200px on a phone, where the rest scroll sideways; the sample shelf while there are none), then one line about the site and Make a shelf (the black button on that screen), and nothing else before the newest shelves (Just shelved); signed in: a welcome by name and nothing else on its line (the headings under it say what they are; nothing on a screen is said twice), New from people you follow (⚡ All activity: a row of cards, one for each person you follow with the newest thing they shelved or logged, a log's worn cover or a shelf's spines on the grey panel, their photo and @username in a thin bar under it, and under the card watched, read or shelved and the date; six across, three on a phone and the rest sideways), then Just shelved. Links to the old builder here (/?open=, /#shelf) go on to build/
build/index.html      the shelf builder (its Add box is the + ADD dialog's search: typing in it opens the dialog and suggests as you type) (Your shelf: there's one shelf each, and signed in it opens yours; signed out it's New shelf and says "the shelf", not "your shelf"): Add, the spines as a list (drag one there or on the preview to move it), Style, the preview; at the bottom its name (one name: it's the caption on the story too), who can view it, Cancel · Save. Clear asks first
add.js                + ADD on every page: the Add dialog (for someone signed in: signed out, + ADD is the sign-in sheet). Also Add.watch() (a title onto the watchlist, from anywhere), Add.attachSearch() (its title search in a page's own box: the Watchlist tab's) and Add.WATCH_CAP (6: the watchlist's size, the same number as in 0007's trigger). Titles are suggested 250 ms after the last key, a newer search cancelling the one before. Picking one shows the spine made from the poster or cover and the Cover at once (Add to shelf works then), each real spine as soon as it's cut; rounds the Worker already keeps come at once, and a round that has to search is still asked only when the ones before weren't enough (LIVE in add.js lets more search at once). Three choices at the top: Put on shelf (suggestions as you type, then the spine choices and Add to shelf; the spine finder lives here), Log it (the cover as the feed will show it, a caption if you want one, Post) and Watchlist (Add to watchlist)
bare.js               saved shelves drawn small from their rows in shelf_items: each row back into a book (its pictures through the Worker), then the shelf cut out of a bare story, as the profile's hero draws it (home's cards), or its spines one by one, all at one scale (home's spine wall). The same as u/'s own: keep them in step
wear.js               a log's cover, worn: one corner dog-eared (a hairline round the fold and a soft shadow under it, so it reads on a white poster), fine scratches, rubbed edges and a little fade, drawn on a canvas from how long ago it was logged (lightly worn that day, with two or three scratches to see; faded after a week, worn after a month). No stamp and nothing written on it
shelf.js              draws the spines and the story (and says where it drew each book); build/ and u/ both use it, so a shelf looks the same everywhere
u/index.html          profiles: /u/?username, the bio in the header under @username (three lines, then "more"), with "on shelfstackd since" small under it; its tabs Profile (their shelf standing on a 1px shelf line at one spine height, 240px or 180px on a phone, from the left; under it a strip of up to four small watchlist covers in one row (100px wide, 80px on a phone) with See all, and on your own From friends, across the column) · Activity · Watchlist (#watchlist: what they want to see and read, the covers clean and still sealed, never worn; yours with a box that adds a title straight in, a dotted + first, Remove and ✓ Mark watched or ✓ Mark read) · Network (Following, Followers), and the shelf's own page: /u/?username&shelf (or &shelf=<id>, the older links): its name with Share beside it (Share to story, Download image, Copy link), who made it, the shelf itself (its books on the grey panel, as the profile has them; the 9:16 story is only made for Share), and On this shelf with + Add to my shelf (to the right of the shelf on a wide window; a title that's already on your own shelf says "On your shelf" instead, and on your own shelf nothing is offered; signed out none is, and Make a shelf in black is under the list); for its owner Edit, Make private or public, Delete
shelves/index.html    every public shelf as a card, newest first, 24 at a time (Load more); Your shelf, or signed out Make a shelf in black (the bar's + outlined, as on home), which asks to sign in
members/index.html    Find @username (people by the start of a username or name, each with FOLLOW), and Recently active: the people behind the newest shelves
settings/index.html   your settings (signed in only; signed out, just Sign in under the heading): PROFILE (display name, bio), PHOTO (cut square, made small, sent to the Worker), ACCOUNT (private profile). A profile's Edit profile comes here
feed/index.html       the feed: /feed/, FOLLOWING · YOU · EVERYONE, a line for each shelf saved ("@abc shelved my films · 2h") with its card, and for each film or book logged ("@abc watched Gummo · today") with its worn cover, small (72 x 108px), and the caption beside it, newest first
worker-address.js     sends Worker requests to its workers.dev address on networks that block api.shelfstackd.com
assets/logo-hedgehog.svg   the logo: a white hedgehog with four coloured quills on #14181C. The bar shows it at 28px left of SHELFSTACKD; its colours are the only colour on the site
favicon.svg           a copy of the logo. favicon-32.png, favicon.ico and apple-touch-icon.png are made from it (tests/art.js); every page links them
favicon.ico           the same mark for a browser that asks for /favicon.ico whatever the page says (without it, that request is a 404 on every page)
tmdb.svg              TMDB's logo, their own file as it comes (the "primary short" one from themoviedb.org/about/logos-attribution), shown small in privacy.html's Credits: their terms ask for it beside their line
privacy.html          what the site keeps and who sees it; at its end, Credits (#credits, where About in every footer goes): TMDB's logo and line, Open Library, Search by Brave
.well-known/appspecific/com.chrome.devtools.json   an empty answer for Chrome, which asks every localhost site for this file while its DevTools are open (the other 404 in the network panel). Nothing reads it
og.jpg                the picture a shared link shows (1200 x 630: the logo in the middle of #14181C); every page names it in its og: and twitter: tags
sample-shelf.jpg      the builder's sample shelf (it's only at build/?sample now: a new shelf starts empty) as a picture; home shows it ("a shelf, for example") while there are no public shelves. Made by tests/art.js
spinetip.js           a shelf's picture: hovering a spine shows "Title (year) · creator", pressing it goes to its row in the list (a shelf's page, and the builder's preview). It uses the places shelf.js says it drew each book
cards.js              shelf cards: finds the books in a shelf's preview picture and cuts the 2:3 card round them (home, the feed, profiles), keeping what it found per preview key
site.css              the look every page shares: one :root block of variables (the 950px column, the type scale, the 4/8/12/16/24/40 spacing, the 3px radius) and what uses them everywhere (the top bar, headings, buttons, fields, shelf cards, tabs, sheets, the footer: one line, About · Privacy · hello@shelfstackd.com). A page's own <style> holds only what that page alone needs
nav.js                the top bar on every page: who is signed in, the account menu (Home, Profile, Shelf, Activity, Network, Settings, Sign out), + ADD and the ▾ next to it. Also Nav.watchable(): a watchlist bookmark on a cover or a spine (on hover; ••• with Add to watchlist on a phone), on the feed, someone's shelf page and Activity, their watchlist and From friends. The places are in each page's markup, in one order signed in or out: ⚡ · Shelves · Members · search
404.html              what GitHub Pages sends for an address that isn't there: its heading ("Nothing on this shelf.") and the way home, no second line saying it again. Its links start at the root (/), since it's served at any depth
admin.html            approve or delete archive uploads (needs the admin token); read reports (Google sign-in, admins only)
tests/                checks for the pages: Playwright, axe, html-validate (see Tests). The site never loads anything from here
worker/               Cloudflare Worker: name lookup, scan search, image proxy (what the live site uses)
backend/              older self-hosted search server (not used right now)
  api/                FastAPI app
  searxng/            your own free search engine, no API key
  docker-compose.yml  runs both with one command
  .env.example        copy to .env for your keys (never commit .env)
```

## How the site talks and looks

Letterboxd's habits are the rule. Each point here has a check in the tests.

- **Nothing is said twice on one screen.** A heading says what a section is; the line under it doesn't say it again.
- **Show, don't instruct.** No sentence explains the page ("Pick Watchlist in + Add to keep…"). An empty place says
  so in six words at most, in words no other empty place uses ("Nothing saved for later.", "No public shelves yet."),
  with a link only where there's somewhere to go. The sign-in sheet is its heading and Continue with Google; it has a
  line only when it was opened on the way somewhere ("Sign in to start your shelf.").
- **No "!", no arrows in the text, an ellipsis only on something under way** ("Loading…", "Saving…"), and "Welcome"
  once at most. The way back from a shelf's page is "Back to @name". Buttons and text actions are in their own case
  (sentence case); only the bar's places and + ADD, section headings and the tiny labels ("Follows you", "private",
  "PRO", a field's name) are in capitals.
- **No dashed underlines.** Links and text actions are plain and underlined on hover only; Delete, Remove and Clear
  are grey.

## 1. Put the website on GitHub Pages

1. Create a new public repository on GitHub, for example `spinestack`.
2. Upload everything in this folder (keep `.gitignore` and `.nojekyll`).
3. Repository → Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)` → Save.
4. After a minute the site is live at `https://YOURNAME.github.io/spinestack/`.
5. The live site has its own domain: `CNAME` holds `shelfstackd.com`, set in Settings → Pages → Custom domain (with
   Enforce HTTPS). Its DNS is on Cloudflare: the four GitHub Pages A records and four AAAA records on the root and `www`
   as a CNAME to `reflexgod.github.io`, all "DNS only" so GitHub can issue the certificate. The old address redirects here.

At this point uploads, spine cutting from scans and the shelf all work (saving and sharing need accounts, below). Search by name needs step 2.

## Worker (what the live site uses)

A free Cloudflare Worker in `worker/` does the parts a static page can't: it looks titles up on TMDB and
Open Library, finds DVD and book scans with image searches (Serper, SerpApi, Brave, then archive.org: see Where scans
come from), and passes scan images through with CORS so the page can cut the spine out of them in the browser
(`findSpine()` in `add.js`). The keys live only in the Worker, as secrets; it never logs them or sends them back.

| Endpoint | What it returns |
|---|---|
| `/identify?q=&want=all\|movie\|book[&suggest=1]` | `{results:[{kind,title,year,creator,cover}]}`: up to 5 films (TMDB) and 5 books (Open Library: only those whose title or author has what was typed, each title once, most-read first, without the government reports it files as books). `suggest=1` is a half-typed title: answered the same, but not kept in KV |
| `/scans?title=&year=&kind=movie\|book&creator=&round=0-3` | one query per round: up to 10 wrap-shaped (or single-spine) scans whose page names the title, plus approved archive spines first in round 0: `{results:[...], round, more}`, with `capped: true` when nothing usable was found and a provider was at its cap (see Where scans come from). With `&cacheonly=1` it never searches, answers from what's kept and says `cached: true` or `false`: the page asks that for rounds 1 to 3 while round 0 searches |
| `/img?url=` | the image, with CORS. http(s) and `image/*` only, 8 MB max, private addresses blocked, 3 redirects max |
| `POST /archive?kind=&title=&year=&author=` | a PNG of one spine (300 KB max, at least 3 times taller than wide), re-encoded and kept as *pending* |
| `/archive/img?id=` | an approved archive spine |
| `POST /report?id=` | one report per visitor; the third sends an approved spine back to pending |
| `/admin/list`, `POST /admin/approve`, `POST /admin/delete` | for `admin.html`, with `Authorization: Bearer <ADMIN_TOKEN>` |
| `/admin/usage` | with the admin token: today's searches by each provider, its cap, whether it's out for the day, whether it has a key (never the key), and Serper's credits used |
| `/admin/raw?provider=serper\|serpapi\|brave\|archiveorg&q=` | with the admin token: what that one provider says, before any filtering. Costs one search. For checking a key, or tuning the filters |
| `POST /m/upload?kind=avatar|wall|png` | signed in: a profile photo, a wall or a wall PNG (PNG, JPEG or WebP by its first bytes, 2 MB max) into R2 under a random key; walls and PNGs only for Pro. 20 a minute and 200 a day per account, 20,000 a day in all: `{key}` |
| `/m/img?k=` | one of those pictures |
| `POST /m/delete?k=` | signed in: deletes one of your own pictures, once no shelf of yours and not your profile uses it |

The Worker answers at `https://api.shelfstackd.com` (a custom domain, in `wrangler.toml`). On networks that block that
domain (some college and office Wi-Fi block new domains), a request that fails with a network error is sent again to the
same Worker at its workers.dev address, and the tab keeps using it for the session (`worker-address.js`). So keep
`workers_dev = true`.
CORS is open only to `https://shelfstackd.com`, `https://www.shelfstackd.com`, `https://reflexgod.github.io` and
`http://localhost:8080`. `/identify` and `/scans`
are cached in Workers KV (so a title is searched for once: `/identify` answers for 30 days, what the scan searches said for a year, or a week when they found nothing), images are cached 30 days,
and each visitor is limited to about 30 searches and 150 images a minute.

### Where scans come from

For each round of a title, `/scans` looks in this order and stops at the first place that gives a usable scan (one the
wrap and spine filters keep):

| | Provider | Key (a Worker secret) | Cap, in `[vars]` | Why that number |
|---|---|---|---|---|
| 1 | what's already kept in KV, and approved archive spines | | | costs nothing |
| 2 | Serper, Google Images (`google.serper.dev/images`) | `SERPER_KEY` | `SERPER_DAILY_CAP = "100"` a day, `SERPER_TOTAL_CAP = "2400"` credits in all | 2,500 free credits, once; a 100-result search costs 2 |
| 3 | SerpApi, `google_images` | `SERPAPI_KEY` | `SERPAPI_DAILY_CAP = "8"` | 250 free a month: 8 a day is at most 248 |
| 4 | Brave Image Search | `BRAVE_API_KEY` | `BRAVE_DAILY_CAP = "30"` | bills after about 1,000 a month: 30 a day is at most 930 |
| 5 | archive.org's search (round 0 only) | none | `ARCHIVE_ORG_DAILY_CAP = "100"` | free; the cap is only manners |

- **Counting.** Each search is counted in the `Archive` Durable Object before it's made, in one step, so a cap can't be
  passed; if the count can't be read the search isn't made. Counts start again at midnight UTC. Serper's credits are
  counted in all, not by the day (its answer says what a search cost, and the count follows that): when
  `SERPER_TOTAL_CAP` is reached Serper is passed over for good, until you raise the number.
- **Out for the day.** A provider that answers 401, 402, 403 or 429 (a bad key, no credit left, too many) is left alone
  until tomorrow. Any other failure (a 400, a 500, no answer) only passes that one search on to the next provider.
- **Serper and quotes.** Serper answers 400 to a search with double quotes in it (`"gummo" 1997 dvd cover`), so it's
  asked without them; the filters look for the whole title in each result anyway. SerpApi and Brave still get the title
  in quotes. If Serper answers 400 all the same, it's asked once more with the plainest search there is
  (`<title> <year> dvd cover`, or `<title> book cover`) before the search goes on to SerpApi; the two count as one
  search. `/admin/raw` takes the quotes out too, but asks only once, so a 400 shows as it is.
- **No key, no provider.** One whose secret isn't set is passed over. `0` as its cap turns one off.
- **Same answer whoever gives it.** Every provider's answer is turned into the same list, the same filters and edition
  rules run on it, and the result has the shape it always had. What was found is kept under `raw1:` as before.
- **Nothing usable.** When every provider was asked, that's kept like any answer. When one was at its cap, out for the
  day or not answering, `/scans` says `capped: true` (the dialog then says "Spine search is resting for today. Here’s
  one made from the cover.") and what there is is kept for a day only, so the title gets its turn tomorrow.
- **archive.org** finds items, not pictures, and doesn't say how large a picture is: the Worker takes up to 4 image
  items with the title in theirs, their largest original JPEGs and PNGs (6 at most), and reads each one's size from
  its first bytes. It finds less than the others; it's the last, free place to look.

To add or change a key: `cd worker && npx wrangler secret put SERPER_KEY` (or `SERPAPI_KEY`, `BRAVE_API_KEY`) and paste
it. A secret takes effect at once, with no deploy. To change a cap, edit the number in `worker/wrangler.toml` and
deploy. To see today's counts:

```
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://api.shelfstackd.com/admin/usage
curl -H "Authorization: Bearer <ADMIN_TOKEN>" "https://api.shelfstackd.com/admin/raw?provider=serper&q=%22gummo%22+1997+dvd+cover"
```

The second asks one provider alone and shows what it said (it costs one search): the way to check that a key works.
`/health` says which providers have a key (`scans`), without the admin token. The Add dialog says "Search by Brave"
under the spines a search found, and so do the Credits on `privacy.html`, which every page's footer links as About.

`cd worker && npm test` runs the whole chain in the runtime `wrangler dev` uses, against made-up providers
(`test/providers.mjs`): the order, the caps, out-for-the-day, Serper's credits, `/admin/usage`, Serper asked without
quotes and its second try after a 400, and that no key comes back in any answer. It needs no keys and spends nothing. To try the real providers on this machine, put their keys in
`worker/.dev.vars` (one `NAME=value` a line; the file is never committed) and run `npx wrangler dev`.

### Set up once

In `worker/`:

1. `npm install`
2. `npx wrangler login` and click Allow in the browser.
3. `npx wrangler kv namespace create SPINE_CACHE`, then put the id it prints into `wrangler.toml`.
4. `npx wrangler secret put TMDB_TOKEN` and paste the TMDB "API Read Access Token" (themoviedb.org → Settings → API).
5. `npx wrangler secret put BRAVE_API_KEY` and paste the Brave Search API key (api-dashboard.search.brave.com).
   `npx wrangler secret put SERPER_KEY` (serper.dev) and `npx wrangler secret put SERPAPI_KEY` (serpapi.com), the same way. Any of the three can be left out: `/scans` uses the ones that are there.
   `npx wrangler secret put ADMIN_TOKEN` and paste a long random string of your own. It's the password for `admin.html`; keep it only in a password manager.
6. `npx wrangler deploy`. It prints the Worker address, e.g. `https://spinestack.NAME.workers.dev`.
7. In `index.html`, `build/index.html`, `u/index.html`, `feed/index.html`, `shelves/index.html`, `members/index.html`, `settings/index.html` and `admin.html`, `window.SPINESTACK_WORKER` is the Worker's address
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

`cd worker && npx wrangler deploy`. Secrets and the KV cache stay as they are. To try a change first without deploying:
`cd worker && npx wrangler dev` runs the Worker on this machine (`http://127.0.0.1:8787`, with its own empty KV and
Durable Object; films need `TMDB_TOKEN` in `worker/.dev.vars`).
If you change what `/identify` answers, bump its cache key prefix in `src/index.js` (`id5:` now: a book's author comes in Latin letters when Open Library has them, 村上春樹 as Haruki Murakami) so answers kept
before the change aren't reused. `/scans` keeps what the providers said as it came (`raw1:`), and its filters run again on that.

### How a real spine is found

0. In the Add to your shelf dialog (`add.js`, opened by + ADD on any page and by the builder's Add box) a title is
   looked up as it's typed: a search starts 300 ms after the last key and replaces the one before it, Enter searches at
   once. Up to six results show, films and books together, the closest titles first (the same as what was typed, then
   starting with it, then containing it); ↑ ↓ move through them and Enter picks one.
1. The page asks the Worker for one round at a time, at most 4 per title, and stops once two good spines turn up, to save searches.
   Films: `"<title>" <year> dvd cover`, `"<title>" <year> dvd cover english`, `"<title>" dvd cover scan`, `"<title>" criterion dvd`.
   Books: `"<title>" <author> book cover spine`, `"<title>" <author> book spine`, `"<title>" spine`, `<title> <author> full cover wrap`.
2. It keeps images shaped like a wrap (1.3–1.9 wide for films, 1.2–2.4 for books) or like a single spine (4 times taller than wide), whose title or address contains the whole title; one-word titles also need the year or director.
3. The page loads each scan through `/img`, and `findSpine()` looks for the strip between back and front: two clear edges near the middle, about 5 % wide for a DVD, lettering on it, an even colour down it. Photos of open cases and books on a table are turned down.
4. Each cut gets a score from 0 to 100. A film's best cut is picked for you only at 75 or more (in tests right spines scored 76–97 and wrong ones up to 69) **and** when it looks like the English edition; books always let you pick, unless the spine comes from the archive. Cuts under 45 aren't shown, and each page gives one option at most.
   Editions: the Worker marks a scan as another edition when its page title, address or file name has another language or region (Polish, Deutsch, español, français, 日本, region 2, `.pl`/`.de`/… pages, `nl`/`ger`/… in file names) and marks VHS tapes. With **Edition: English** (the default) English DVDs and Blu-rays come first; VHS comes last either way. **Any** drops the language rule.
5. With no good scan, or when the day's searches are used up, the pick is a spine made from the poster or cover.
   Add to shelf puts the picked one on the shelf.

## Profiles

`/u/?username` (a real file, so GitHub Pages answers 200 and link previews work): photo, name, @username, the numbers
(Spines on their shelf, Following, Followers: at the right on a wide window, and on a phone one small line of links
under the name, "2 spines · 1 following · 2 followers"), then the tabs. Profile has their shelf, big, across the column, with its
name under it; then Watchlist (up to 6, shown to anyone who can see the profile) and, on your own, From friends (what
the people you follow logged lately and you haven't, up to 6); the bio beside them. `/u/?username&shelf` is the
shelf's own page, and `/u/?username&shelf=<id>` still opens a shelf by its id. The owner gets Edit profile (photo,
name, bio, Private profile). The header's @username and the Profile link lead there.

**Signed out, the site is read only** (as on Letterboxd). A visitor can look: home (the spine wall, Just shelved),
`/shelves/`, `/members/`, public profiles and shelf pages, the feed's Everyone, privacy. Nothing can be made or added:
+ ADD, Make a shelf (home, `/shelves/`) and + Add to my shelf open the page's sign-in sheet ("Sign in to start your
shelf." and Continue with Google), and `/build/` is only "Sign in to make your shelf." with the Google button. The pages
never ask `/identify` or `/scans` signed out. After signing in, `nav.js` (`Nav.needAccount`) takes them where they were
going: the builder (with the spine, from + Add to my shelf), or the Add dialog. No shelf is kept in the browser before
signing in.

**One shelf each.** A person's shelf is the main one (`pinned_shelf_id`) if one was picked before, otherwise the one
saved last; the builder opens and saves that same one (`yourShelf()` in `build/`, `theShelf()` in `u/`). There's no
Shelves tab, no "+ new shelf", no Make main and no main shelf in Settings any more. Accounts that made more than one
before keep the others in the database: nothing lists them, and their old links still open them (`?open=<id>` in the
builder too). The database doesn't enforce one shelf; `supabase/migrations/0007_logs_watchlist.sql` ends with the query and
the index that would, for the owner to decide. On your own profile, Edit under your shelf goes to the builder; with no
shelf yet it says "Your shelf is empty." with Make your shelf. (The builder used to open in a frame
over the profile, `?embed`; old links of that kind are sent on to the builder itself.)

**Watchlist and From friends.** The watchlist has its own tab (`#watchlist`), as on Letterboxd: "You want to see 4
films and read 2 books", then the covers, clean and new with a faint sheen of plastic wrap (not worn: wear and the dog-ear say it's been watched or read, so a title gets them from `wear.js` once it's logged), the title over each on hover (under it on a phone). On
your own a box adds a title straight in (the + ADD dialog's search, `Add.attachSearch`; no dialog, no spine search),
the first tile is a dotted + that goes to the box, an empty one says "Add a film or book you want to get to.", and each
title has Remove and ✓ Mark watched (✓ Mark read for a book). It holds 6 (`WATCH_CAP` in `add.js`, and 0007's trigger): full, it
says "Your watchlist is full (6). Remove one to add another." The Profile tab has a strip of up to four of its covers, small (100px wide, 80px on a phone), in one row,
and See all. Any cover or spine elsewhere (the feed, someone's shelf page or Activity, their watchlist, From friends)
has a bookmark on hover, or ••• with Add to watchlist on a phone: one press and it says In watchlist in grey text (no button), as a title already on your watchlist does from the start (signed out, the
sign-in sheet, and it's added once you're signed in). A watchlist is private by default, with Make public / Make
private on your tab (`profiles.watchlist_public`, from migration `0008`, live since 2 October 2026); someone else's
Watchlist tab and strip show only when theirs is public. On a database without `0008` the page behaves as before:
no toggle, and a watchlist is seen by whoever sees the profile. Each From friends title has Keep (onto your watchlist,
saying whose log it came from), Remove (kept out for good) and
✓ Mark watched / ✓ Mark read. Either opens + ADD's Log it on that title, and logging a title takes it off your watchlist.
Private shelves (Who can view: Private in the builder) show only to their owner. A private profile shows others only its photo,
display name and @username; its public shelf, its logs and its watchlist show to its owner and the followers it accepted.

## Logs, the watchlist, and what the database needs for them

+ ADD has three choices: **Put on shelf** (as before), **Log it** and **Watchlist**. Log it is a film watched or a book
read, with a caption if you want one (280 characters); it goes on the feed as "@you watched Gummo · today" (or "read"),
with its cover drawn by `wear.js`: one corner dog-eared, a few fine scratches, rubbed edges and a little fade, worked out
from when it was logged, so it's lightly worn that day (two or three scratches show), more faded after a week and more
worn after a month. On the feed the cover is small, 72 x 108px, with the caption beside it. No stamp,
nothing written on it. The time on a log's line is by the day: today, yesterday, then 3d, 2w. Your own logs have Delete
on your profile's Activity. Log it and Watchlist never search for spines, and need an account with a username (signed
out, the dialog says so with Sign in).

These use tables that migration `0007` adds. **`supabase/migrations/0007_logs_watchlist.sql` was run on the live
database on 2 October 2026**, by the owner, in the SQL Editor. It adds `logs`, `watchlist` (6 at most, each title
once), `friend_hides` (what you removed from From friends), `log_counts` (the day's count of logs, the database's
own), `title_key()`, and two functions: `activity()` (the feed: shelves and logs together) and `from_friends()`.
`supabase/tests/rls_phase4.sql` is its test, written like `rls_phase3.sql`. Both tests passed on the live database
after the run (`ALL PHASE 4 CHECKS PASSED`, `ALL PHASE 3 CHECKS PASSED`), as they had on a local Postgres 16 before
it. From outside, a visitor gets the feed from `activity()`, and "permission denied" for `from_friends()` and for
`log_counts`. `docs/RUN-0007.md` has the steps that were followed and a way to take it out again;
`docs/proposed-0007.md` says what each page asks the database for.

**`supabase/migrations/0008_watchlist_privacy.sql` was run on the live database on 2 October 2026** too. It adds
`profiles.watchlist_public` (false for everyone, so every watchlist turned private), `watchlist_is_public()`, and the
watchlist read policies that ask it: the owner always sees theirs, anyone else only when it's public and they could
see the profile. Its test is `supabase/tests/rls_phase5.sql` (`ALL 0008 CHECKS PASSED`, on the live database and on a
local Postgres 16). `rls_phase4.sql` now makes its private D's watchlist public, so it needs `0008` too.

The live pages are still `main`, which doesn't ask for any of this: logs and the watchlist reach the site when
`letterboxd-flow` is merged. On a database without `0007` the pages do without: the feed asks for `activity()` once,
and on "not found" uses `feed()` from `0006` (shelves only); a profile shows no Watchlist and no From friends, and
Activity is shelves only; Log it and Watchlist say "Logging isn’t open yet" and "The watchlist isn’t open yet".

## Follows and the feed

FOLLOW on a profile follows a public profile at once and sends a request to a private one (its owner answers under
REQUESTS on their profile). FOLLOWING and FOLLOWERS open the lists, 30 at a time. 100 follows and unfollows an hour
per account, counted in the database. `/feed/` shows public shelves and logs, 20 at a time: EVERYONE from public
profiles, FOLLOWING from the people you follow, YOU your own. A shelf moves up only when it's saved in the builder
(`shelves.saved_at`); renaming it doesn't. All of it is decided in the database (`0006`, and `activity()` from
`0007`), not in the page. A log posted with + ADD on the feed puts the tab back at the top, with it there.

Photos, walls and PNGs live in the R2 bucket `shelfstackd-media` (binding `MEDIA`). Create it once, in `worker/`:
`npx wrangler r2 bucket create shelfstackd-media`, then `npx wrangler deploy`. Keep `USER_R2` commented out: binding it
would hide the shelf images already saved in KV.

## Accounts (Supabase)

Sign in with Google, save shelves, open them again. Everything else on the site works without an account, and
signed-out visitors never load the Supabase library.

- **Where things live:** text rows (profiles, shelves, shelf items) in the Supabase project "shelfstackd"
  (Mumbai, free plan). Images a saved shelf needs, and each shelf's small preview, in the Worker's KV
  (`ub:<user id>/...`); archive spines and TMDB / Open Library covers are pointed at, not copied.
- **Keys:** only the Project URL and the *publishable* key are used, in `index.html`, `build/index.html`, `u/index.html`, `feed/index.html`, `shelves/index.html`, `members/index.html`, `settings/index.html` and in `worker/wrangler.toml`
  `[vars]`. Both are public; Row Level Security protects every table. The secret / service_role key isn't used
  anywhere and must never be added to the page, the repo or the Worker.
- **Database:** run each file in `supabase/migrations/` once, in order, in the dashboard's SQL Editor (the live
  database has them all, `0001` to `0008`; there is no `0003`). Then run the test for the newest one
  (`supabase/tests/rls_phase5.sql` after `0008`, `rls_phase4.sql` after `0007` and `0008`, `rls_phase3.sql` after `0006`): it plays a few users and a signed-out visitor,
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
- **Limits:** one shelf each on the site (the database still allows 200 an account: see Profiles), 6 spines a shelf (20 with Pro; over 10 they stand in two rows), 50 logs a day and 6 on a watchlist (the database holds both, since 0007); the Worker saves at most 150 images a day per account and
  600 a day in all (KV's free plan allows 1,000 writes a day). To move images to R2 later, create a bucket and
  uncomment the `USER_R2` binding in `wrangler.toml`; the same keys are used there.
- **Staying awake:** Supabase pauses free projects after a week without activity; the Worker's daily cron
  (03:00 UTC) makes one tiny read so it doesn't.
- **Privacy:** `privacy.html`. Accounts are for people 18 or older.

## Libraries

No build step, no framework. A page loads a library only from `cdn.jsdelivr.net`, at an exact version, with an
`integrity` hash (as the Supabase script is loaded); `tests/specs/libraries.spec.js` checks that. Menus and popups use
the browser's own `<dialog>` and `popover`; relative times use `Intl.RelativeTimeFormat`. All MIT, except Lucide (ISC).

| Library | For | File on `cdn.jsdelivr.net/npm/` | `integrity` |
|---|---|---|---|
| Supabase JS 2.117.2 | accounts | `@supabase/supabase-js@2.117.2/dist/umd/supabase.js` | `sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok` |
| Floating UI core 1.8.0 | needed by Floating UI DOM | `@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js` | `sha384-HNCdK6HYLs4EKIDg2Ml3NdfNMVD/LcFbGXnagRABpWmpJjiEuhrtSIckScRnqDOD` |
| Floating UI DOM 1.8.0 | keeps the account menu and the ▾ menus on screen | `@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js` | `sha384-h02fHnOrZRtL8NvKyMkr2vfTxUr0lTnQdZexzrbPfME4nd74qGfOZ97tbiroJo1Y` |
| SortableJS 1.15.7 | dragging spines into order in the builder | `sortablejs@1.15.7/Sortable.min.js` | `sha384-DgmC6Xe2bSN2WjTDXzWYbUbxyhNP+NNkGDR/g78pCXV7E7rcVTGxVg0uIVCUUcBc` |
| Cropper.js 1.6.3 | square crop of a profile photo | `cropperjs@1.6.3/dist/cropper.min.js` | `sha384-aKBOyDyHi7nysLl4xSArmbTpotGkhOQNGnSQaljyIveY3ofQZ3GWak4U9F5NcPxI` |
| | its stylesheet | `cropperjs@1.6.3/dist/cropper.min.css` | `sha384-4B0iRmDz7QrXJK2xob77YvAC46zoUOJDr2MOKrkWWR7QoJg9i63rGSnCwIjGYGHs` |
| browser-image-compression 2.0.2 | shrinks the photo before upload (the Worker takes 2 MB at most) | `browser-image-compression@2.0.2/dist/browser-image-compression.js` | `sha384-dHP9fwqd9BAiDh9uJ0p10khgbbcFMh34bVEiCnJ1Ah/AT2T2k4t572VEo3WXzxXp` |
| Lucide 1.49.0 | icons (zap, search, chevron-down, x, plus) | pasted into the pages as inline SVG, not loaded | |

Supabase loads on a page only for someone signed in or signing in; Floating UI by `nav.js`, only for someone signed
in, who has the menus; SortableJS by the builder; Cropper.js and browser-image-compression by `settings/`, when a photo
is first chosen there (the compression runs on the page itself, not in its web worker, which would fetch the library
again with no integrity check). To change a
version: `curl -s <file's address> | openssl dgst -sha384 -binary | openssl base64 -A` gives the new hash.

## Tests

In `tests/`, with its own `package.json`. Once: `npm install`, then `npm run setup` (downloads Playwright's Chromium).

```
cd tests
npm run test:all     # html-validate, then Playwright
npm test             # Playwright only
npm run test:html    # html-validate only
npx playwright test specs/site.spec.js --project=phone-390    # one file, at one width
```

- **Playwright** (`specs/site.spec.js`) opens every page at 1280 px and at 390 px, signed out and signed in: the top
  bar is there with its places in one order (⚡ · Shelves · Members · search, signed in or out), the page doesn't scroll
  sideways, nothing is logged as an error, signed-out home loads its shelves, and
  old builder links at the root go on to `/build/`. The account menu: its seven items with Sign out last, open by tap,
  by mouse and by keyboard, closed by Esc and by a click outside, always inside the window; Sign out signs out.
- **The builder and + ADD** (`specs/build.spec.js`): + ADD opens the dialog on every page and Esc closes it;
  search, pick, Add to shelf on the builder (no reload) and from another page (which goes to the builder, where your
  shelf opens with the spine after what was there, or starts it); the builder's fields, Style shut with its one line,
  a row's controls opening one at a time, ↑ ↓ and dragging; signed out, the builder closed ("Sign in to make your
  shelf." and Continue with Google, nothing searched); Save signed in before you have a shelf, and signed in with one
  (saved over, never a second shelf);
  `?open=<id>`, `?new`, old `?embed` links, Edit under your shelf and Make your shelf on your profile, your shelf being
  changed surviving a trip to another page (and giving way to an older shelf that's opened by its link), Cancel; the order of the
  page, dragging a spine on the preview (mouse, and hold-then-drag with a finger), and the caption: it follows the
  Name, and with no name the preview's faint "your shelf" is not in the picture saved with the shelf. A shelf has one
  name: Style has no Caption, and a shelf that had a caption of its own is saved with its name as both. The bar has
  only Cancel and Save, side by side at 360 to 430px.  Clear asks first (Cancel and Esc leave the spines); the sample
  shelf just goes.
- **The dialog's search** (`specs/add.spec.js`; signed out, + ADD is the sign-in sheet on every page, in `specs/log.spec.js`): suggestions while typing with one search for a word typed quickly, a
  slower earlier answer dropped, six results in order of closeness, ↑ ↓ Enter Esc, Enter searching at once, the
  loading and nothing-found lines, at the right of the All · Films · Books row (nothing held open, nothing moving);
  the capped answer from `/scans` and its message; "Search by Brave", small and grey, under the spines a search found
  (not before a search, and not in Log it or Watchlist); every page's footer (one line of small grey print: About ·
  Privacy · hello@shelfstackd.com, About going to the Credits, and no credits in it); the builder's count and limit, its empty shelf,
  and the note under the preview clear of the Save bar.
- **The look** (`specs/look.spec.js`): the content and the bar's contents in one 950px column on every page, the type
  scale, one black button a screen, shelf cards six across at 150px (three on a phone) cut 2:3, the profile's name,
  numbers (on a phone, one small line under the name and no band) and tabs, and its shelf across the column on the
  wash.
- **Who you both know** (in `specs/profile.spec.js`): "Follows you" by the name of someone who follows you, and
  "Followed by @a, @b and N others" under the bio, read from the follows and the followers list that are already there.
- **A profile's tabs** (`specs/profile.spec.js`): Profile · Activity · Watchlist · Network, their addresses and ← → (and an old
  `#shelves` link landing on Profile); their shelf first, on a 1px line at one spine height from the left, then the
  watchlist strip across the column, and no Most shelved; the bio in the header, three lines and "more"; Activity's lines for shelves and logs, a log's worn cover and caption; Network's Following and Followers and
  the numbers that open them; the account menu's links changing the tab on your own profile without loading it again,
  and its Shelf going to your shelf's page. Your watchlist (Remove, Watched or Read) and From friends (Keep, Remove,
  Watched or Read), what each sends, and Watched opening Log it on that title; and both left out, with Activity
  shelves only, before the database has them.
- **The watchlist** (`specs/watchlist.spec.js`): its tab (what you want, the + tile, the worn covers, the title on hover
  or under it), the box that adds a title straight in, full at 6, empty, someone else's, before and after 0008 (Make
  public, and a private one not shown), and the bookmark or ••• on the feed, a shelf page and From friends, signed in
  and signed out.
- **A shelf's page** (`specs/shelf.spec.js`): signed out, + Add to my shelf opens the sign-in sheet, and once signed
  in the builder opens with that spine on your shelf; its heading, Share (the story to a share sheet or saved, the picture,
  the link), the "Saved." line once after Save, the shelf itself on the grey panel (not the story: nothing drawn behind
  the books, and on the first screen on a phone), and the list of what's on it, to its right on a wide window and
  under it on a phone; the way back as plain grey text, a small action dashed, Delete dashed in grey; + Add to my shelf putting that same spine on your shelf with nothing searched for, and not offered for a title your shelf
  already has ("On your shelf" on someone else's shelf, nothing on your own);
  for its owner Edit, Make private, renaming it in the heading, and Delete only after the confirm (then back to the
  profile); `/u/?name&shelf` as their shelf, and with none yet; a shelf that isn't there.
- **Spines on a picture** (`specs/tips.spec.js`): on a shelf's page and on the builder's preview, the tooltip over a
  spine, a press going to its row and marking it, and a drag on the preview not counting as a press.
- **Settings** (`specs/settings.spec.js`): signed out and with no username yet; the three tabs and their addresses;
  Profile's Save sending the name and bio (no main shelf to pick); a photo cut square, made small (WebP, under the Worker's 2 MB),
  sent to the Worker and saved, then removed; Cancel; the private profile switch; a profile's links here.
- **Shelf cards** (`specs/cards.spec.js`): on home's Just shelved, the feed and a profile, a pile, covers and a row are each in the
  middle of their card with room round them, the caption and the "made with" line clipped off, on the story's colour;
  a picture is looked at once (kept per preview key); a picture with no plain background, or one that comes without
  CORS, still shows with the stylesheet's cut.
- **Home's copy** (in `specs/site.spec.js`): signed out, the spine wall (the newest spines, three from each person
  first and then more from the same shelves up to 24, each shelf's spines one link to it in their order on it, on a
  1px line, 280px at most and fitting across the column, 200px on a phone and sideways, never stretched, in the middle
  when there are only a few), the
  one line under it from the left, Make a shelf as the one black button (the bar's + outlined there), How it works
  in three steps, with no "lets you" tiles; signed in, the welcome and ⚡ All activity, and New from people you follow
  as a row of cards (from `activity()`, one for each person, the newest thing from them: a log's worn cover, a shelf's
  spines on the grey panel, the thin bar with their photo and @username, watched, read or shelved and the date under
  it, no captions; 2:3, a 1px border, no shadow, six across or three on a phone and the rest sideways; shelves only,
  from `feed()`, on a database without logs; an empty panel when a shelf's spines can't be read); no em dash and no
  rule-of-three line; no ellipsis on a placeholder, a menu item or home's welcome line.
- **Shelves and Members** (`specs/shelves.spec.js`, `specs/members.spec.js`): Make a shelf in black signed out (no "Your
  shelf") and Your shelf signed in; every shelf as a card, 24 at a time and
  what Load more asks for; one people search 300 ms after the last key, Enter at once, the search kept in the address,
  FOLLOW and UNFOLLOW, FOLLOW signed out (sign-in, then finished once back), Recently active.
- **Titles and icons** (`specs/meta.spec.js`): every page has its own title and a description of a sensible length,
  links the three icons (which exist, at the right sizes) and names the share picture (1200 x 630); a profile's and a
  shelf's title carry the person's name.
- **A page that isn't there** (`specs/notfound.spec.js`): any missing address, however deep, gets `404.html` with the
  status 404 (`tests/serve.js` does what GitHub Pages does), styled, with a link home that works from there.
- **Privacy** (`specs/privacy.spec.js`): the page's sections, and that it says what the site does now (the feed, being
  found, follows, private shelves and profiles, Settings, the photo); and its Credits: TMDB's logo (their file,
  unchanged, loaded, 14px tall) over their line, Open Library and Search by Brave.
- **Nothing missing** (`specs/requests.spec.js`): every page, signed out and signed in, gets an answer for everything
  it asks this site for; and the two things a browser asks for by itself (`/favicon.ico`, and Chrome's DevTools file)
  are there.
- **An empty site** (`specs/empty.spec.js`): with no public shelves, home shows the sample shelf on the spine wall's line, and
  shelves, members and the feed each say so in a few words ("No public shelves yet.", "No members yet.", "Nothing on the
  feed yet.").
- **The feed** (`specs/feed.spec.js`): the three tabs and which one opens, what a line says for a shelf and for a log
  (with the clock held still, so "today", "2h" and "1w" are known), Load more, a log's cover (72 x 108px, in line
  with the text, the caption beside it on a phone too) more worn the older it is, You, signed out, a log posted with + ADD showing at
  the top, the feed before the database has logs (shelves only, from `feed()`), and ← → between the tabs.
- **+ ADD's three choices** (`specs/log.spec.js`): Put on shelf · Log it · Watchlist, Put on shelf first, the
  dialog's title for each; Log it's cover, caption and Post (what it sends, "watched" or "read", and no spine searched
  for); Watchlist's Add to watchlist, and the database's answers when it's full or the title is already there; a title
  keeping its place when the choice changes; signed out and with no username yet; before the database has logs.
- **A new account** (`specs/newuser.spec.js`, with `mockNetwork`'s `fresh`: a username and nothing else): home says
  "Welcome, @you." (not "Welcome back", which is for someone with a shelf), and nothing else on that line; your empty shelf, watchlist, From friends, Activity, Following
  and Followers each say so in a short line of their own ("Nothing saved for later.", "You follow nobody yet."), with a
  link to Members where that's it, and no sentence about how to use the page; every empty place a new account meets is
  six words at most and no two say the same; someone else's empty lists stay plain; the feed's Following and You.
- **No connection** (`specs/offline.spec.js`): signed in, with the database out of reach, Settings, the feed's You tab
  and a profile say "Couldn’t reach shelfstackd", the bar offers no Finish sign-up, and the builder's Save says the
  account couldn't load instead of asking for a username. A page tells "couldn't read your account" (`unreachable`)
  apart from "no username yet". With nothing reachable, Log it's Post says so and stays open, and the Add dialog's
  search says it didn't answer, with the last search's titles gone.
- **Press areas on a phone** (`specs/taps.spec.js`, phone only): on every page, in the Add dialog, the menus, the
  sign-in sheet and the builder's Style, a press 21px up, down, left or right of a control's middle still lands on it,
  as `elementFromPoint` finds it. On a touch screen (`pointer:coarse`) a small control takes its press in the 44 x 44px
  round its middle (a see-through `::before`), and close rows are a press apart; on a mouse nothing changes. Left out:
  links inside a sentence. The logo is in: the bar's two rows are 44px apart, middle to middle.
- **A log's worn cover** (`specs/wear.spec.js`): 2:3, the top right corner folded away, nothing ever written on it,
  lightly worn on the day (a few fine scratches show, and the fold's hairline and shadow show on a white poster), more
  faded after a week and more worn after a month, and the same log worn the same way every time.

`npm run shots` (in `tests/`) saves screenshots of home (signed in, following five more made-up people so its row of
cards is full; signed out; and with no shelves yet), the builder, a profile's tabs,
your own profile (and with no shelf yet), a shelf's page, the feed (and before the database has logs), + ADD (its
choices, Log it, Watchlist), shelves, members, settings, privacy and the not-found page at 1280px and 390px into
`tests/shots/`, with the tests' made-up data, the real fonts, and the clock held at 30 September 2026, 14:00 UTC.
- **axe** (`specs/a11y.spec.js`) runs on every page, `privacy.html` and `admin.html` too: nothing serious or critical.
- **html-validate** reads every HTML file with its recommended rules, except that inline `style` is allowed and the
  doctype is lowercase (`tests/.htmlvalidate.json`).
- The tests never reach Supabase, the Worker, Google Fonts or jsDelivr, and never use a real account: `tests/site.js`
  answers those requests with made-up people and shelves, a made-up signed-in session, and the libraries from
  `tests/node_modules`. They serve the repo's files themselves (`tests/serve.js`, port 8181). A new page goes into
  `PAGES` in `tests/site.js`.

`npm run art` makes the site's own pictures again and saves them at the root: the sample shelf (`sample-shelf.jpg`), the
share picture (`og.jpg`) and the icons (from `assets/logo-hedgehog.svg`). Run it when the builder's sample shelf or the logo changes (`node art.js icons` makes only the icons and `og.jpg`).

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
- TMDB requires its credit line and logo: they're in `privacy.html`'s Credits, which every page's footer links as About.

## To do

- [x] Phase 2: a Cloudflare Worker to hide the TMDB token. The token now lives only in the Worker (see "Worker" above).
