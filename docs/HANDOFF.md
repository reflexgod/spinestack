# Handoff: letterboxd-flow

Written on 2 October 2026, before this work moves from the laptop to a cloud session. Read this first, then
`README.md`, which says what every file is and how the Worker, the accounts and the tests are set up.

## Where things stand

- **Branch:** `letterboxd-flow`, pushed to `origin` (github.com/reflexgod/spinestack). It is 49 commits ahead of
  `main` and has everything from the older local branches in it (`phase2-profiles`, `phase3-feed`, `profile-polish`,
  `domain-move`, `drop-fallback`), so no other branch needs pushing.
- **`main` is the live site.** GitHub Pages serves shelfstackd.com from `main`, which is still at `064ac13`. Nothing on
  this branch is on the live pages yet. **Do not merge into `main`** until the owner says so.
- **The Worker is deployed by the owner, by hand, from this branch.** On 2 October `https://api.shelfstackd.com/health`
  listed all four scan providers, so the provider chain (`848541c`) is live. The Serper fix after it (`3774d06`) is
  committed but **not deployed yet**.
- **The working tree was clean** when this was written.

## Rules

These are the owner's standing rules. They apply to every change, in any session.

1. **Our look.** Every page uses `site.css` and its variables, and nothing else for shared things: black ink on white
   paper, Geist Mono, one 950px column that the top bar's contents share, the type scale in `:root`, only the
   4/8/12/16/24/40 spacing, the 3px radius, one black button a screen, shelf cards 2:3 and six across (three on a
   phone). A page's own `<style>` holds only what that page alone needs. No build step and no framework; a library only
   from `cdn.jsdelivr.net` at an exact version with an `integrity` hash. Copy is plain English: no em dashes, no
   rule-of-three lines, no "lets you" tiles. `tests/specs/look.spec.js`, `libraries.spec.js` and the copy checks in
   `site.spec.js` hold most of this in place; keep them passing rather than changing them to fit.
2. **No new migrations without asking.** `supabase/migrations/` stops at `0006` (there is no `0003`). If a feature
   seems to need a new table, column, policy or function, stop and ask first. Several features on this branch were
   built to read what is already there for that reason (the feed's You tab, "Follows you", "Followed by").
3. **Don't touch the drawing in `shelf.js`.** It draws the spines and the story, and the builder and the profiles both
   use it, so a saved shelf looks the same everywhere. Things that need to know where a book is (`spinetip.js`,
   dragging on the preview, `cards.js`) read the places `shelf.js` says it drew each book; they don't change how it
   draws.
4. **Never deploy.** No `wrangler deploy`, no `wrangler secret put`, nothing that changes what is live. Finish the
   change, test it, commit it, and give the owner the command: `cd worker && npx wrangler deploy`.
5. **Keys only as wrangler secrets.** `TMDB_TOKEN`, `SERPER_KEY`, `SERPAPI_KEY`, `BRAVE_API_KEY` and `ADMIN_TOKEN` are
   Worker secrets. They never go in the repo, the pages, `wrangler.toml`, a commit message or a log. The only keys in
   the repo are Supabase's project URL and publishable key, which are public. The Supabase secret (service_role) key
   isn't used anywhere and must not be added. `worker/.dev.vars` is for a machine's own `wrangler dev` and is never
   committed.
6. **Don't merge into `main`**, and don't push to it. Work stays on `letterboxd-flow`.

How commits are made here: one change a commit, the message a few plain sentences saying what the site does now, the
README brought up to date in the same commit, and a test for the change in it too.

## What's done on this branch

In the order it was built (`git log main..letterboxd-flow` has each step):

- **Follows and the feed (phase 3).** Migration `0006` and `supabase/tests/rls_phase3.sql`; FOLLOW, requests to private
  profiles, real follower numbers and the lists; `/feed/`.
- **The Letterboxd flow.** The builder moved to `/build/` (old links at the root go on there); a home page at the root,
  signed out and signed in; one top bar on every page (`nav.js`) with the account menu, Sign out last, signing out on
  this device only.
- **+ ADD on every page** (`add.js`): the Add to your shelf… dialog with suggestions as you type, six results by how
  close the title is, the spine choices, Add to shelf.
- **The builder as a New shelf page:** Add, the spines as a list, one Style panel, the name and who can view it in the
  bottom bar with Cancel and Save. A new shelf starts empty. Spines can be dragged on the preview. The caption follows
  the Name.
- **The look:** `site.css`, one `:root` block of variables that every page uses.
- **New pages:** `/shelves/`, `/members/`, `/settings/` (Profile, Photo, Account), `404.html`; `privacy.html` brought up
  to date.
- **Profiles:** tabs Profile · Shelves · Activity · Network; "Follows you" and "Followed by @a, @b and N others"; your
  shelf cards open the shelf's page, with one ··· menu.
- **A shelf's own page:** its heading, Share (Share to story, Download image, Copy link), On this shelf with + Add to my
  shelf, and for its owner Edit, Make main, Make private or public, Delete.
- **Shelf cards** (`cards.js`) cut 2:3 round the books in the picture, on home, the feed and profiles. Hovering a spine
  on a shelf's picture names it (`spinetip.js`).
- **Every page:** a favicon, a share picture, its own title and description; an empty site says so in a line.
- **The Worker:** `/identify` drops Open Library's government reports and books that don't have what was typed
  (cache key `id4`), and takes `suggest=1` for half-typed titles. `/scans` looks with Serper, then SerpApi, then Brave,
  then archive.org, each with a daily cap counted in the `Archive` Durable Object; `/admin/usage` and `/admin/raw`.
- **The Serper fix (`3774d06`, the last code commit).** Serper answers 400 to a search with double quotes in it, so
  every Serper search was failing and going on to SerpApi. It is now asked without the quotes, asked once more with a
  plainer search if it still answers 400, and a 400 never puts it out for the day. See "Where scans come from" in the
  README.

## What's tested

Both suites were run on 2 October 2026 on the laptop (Windows 11, Node 26).

- **The Worker's providers:** `cd worker && npm test`, 21 checks, all passing at `3774d06`. They run the real Worker
  code in Miniflare against made-up providers, so they need no key and spend nothing. The made-up Serper answers 400 to
  double quotes as the real one does; run against the code before the fix, the first check fails.
- **The pages:** `cd tests && npm run test:all` (html-validate, then Playwright at 1280px and 390px, with axe).
  html-validate clean, then 397 passed, 11 skipped, none failed, in about 4 minutes. The skipped ones are checks that
  belong to one width only (a mouse on the phone project, and the like). This run was at `848541c`; the two commits
  after it changed only `worker/`, `README.md` and `docs/`, which the page tests don't read.
- **Not tested by anything here:**
  - The real providers. That Serper answers 400 to quotes and 200 without them is what the owner saw calling it with
    their own key; the fix has not been run against the real Serper yet, because that needs a deploy.
  - Whether SerpApi minds quotes. Its documentation says quoted phrases are fine in `q`, and its request is built
    differently (a GET with `q` URL-encoded), but no real call was made: no SerpApi key is on any machine a session can
    read. See the open tasks.
  - The database. `supabase/tests/rls_phase3.sql` is run by hand in the Supabase SQL Editor. It wasn't run in the last
    session, and the repo doesn't say when it last was.

## Open tasks

This list is what the repo and the last session show. Anything the owner asked for in an earlier conversation that
never reached a commit isn't here, so ask before assuming the list is complete.

1. **Deploy the Worker with the Serper fix** (the owner does this): `cd worker && npx wrangler deploy`. Then, with the
   admin token, `/admin/raw?provider=serper&q=%22gummo%22+1997+dvd+cover` should answer with results, not
   "Serper answered 400", and `/admin/usage` should show Serper not out for the day.
2. **Check SerpApi with quotes for real** (the owner, one search of the day's 8):
   `curl -H "Authorization: Bearer <ADMIN_TOKEN>" "https://api.shelfstackd.com/admin/raw?provider=serpapi&q=%22gummo%22+1997+dvd+cover"`.
   `/admin/raw` sends SerpApi the search as it's typed, quotes and all. Results mean it's fine. "SerpApi answered 400"
   means it has the same problem, and `serpapi()` in `worker/src/index.js` should then take the quotes out the way
   `serper()` does (`unquoted()` is already there).
3. **Serper's credit count is too high.** Each search is counted as 2 credits before it's made, and a search Serper
   refuses isn't given back. So every search that got a 400 while the chain was live added 2 credits that Serper never
   charged, and `/admin/usage` will show more used than Serper's own dashboard. The count only errs towards stopping
   early. To decide: leave it, raise `SERPER_TOTAL_CAP` by the difference, or give credits back when a search fails
   (a small change in `rawScans()` and `rawFrom()`; there is no way yet to set the count from outside).
4. **Nothing to clean up in KV after the fix.** A title whose search fell through to another provider and found a scan
   is kept as usual; one that found nothing while a provider was failing was kept for a day only, so it gets its turn
   with Serper by itself.
5. **"Search by Brave" is in every footer**, but Serper and SerpApi (both Google Images) are now asked before Brave.
   Whether the credit line should change is the owner's call. `tests/specs/add.spec.js` checks the line, so the test
   changes with it.
6. **Merging into `main`** makes all of the above the live site. Not until the owner says so. Before it: the owner
   confirms the live database has `0004`, `0005` and `0006` (the pages on this branch need them), and both test suites
   pass.

## How to run the tests

Neither suite needs a key, a login or the network once the packages are installed.

```
# the Worker's scan providers (about 20 seconds)
cd worker
npm install          # once: wrangler brings Miniflare and esbuild, which the test uses
npm test

# the pages
cd tests
npm install          # once
npm run setup        # once: downloads Playwright's Chromium
npm run test:all     # html-validate, then Playwright
npm test             # Playwright only
npm run test:html    # html-validate only
npx playwright test specs/site.spec.js --project=phone-390    # one file, at one width
```

- The page tests serve the repo's own files (`tests/serve.js`, port 8181) and answer every request to Supabase, the
  Worker, Google Fonts and jsDelivr with made-up data (`tests/site.js`). A new page goes into `PAGES` there.
- On a fresh Linux machine Chromium may need its system libraries: `npx playwright install --with-deps chromium`.
- `npm run shots` (in `tests/`) saves screenshots of every page at both widths into `tests/shots/`, which is the
  quickest way to look at a change to the look.
- The database tests (`supabase/tests/*.sql`) run only in the Supabase SQL Editor, by the owner.

## What a cloud session doesn't have

- No `wrangler login`, no secrets and no `worker/.dev.vars`. It can't deploy (and mustn't), can't call the real
  providers, and can't use `/admin/...` on the live Worker. Use the made-up providers in `worker/test/providers.mjs`.
- No Supabase dashboard. It can read the migrations and the SQL tests but not run them.
- No `node_modules`: run `npm install` in `worker/` and in `tests/` first.
- The folders `design/`, `textures/raw/`, `worker/debug/` and `tests/shots/` are not in the repo (`.gitignore`).
