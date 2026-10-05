# Handoff: letterboxd-flow

Written on 2 October 2026, before this work moves from the laptop to a cloud session, and brought up to date the same
day in that cloud session, after one shelf each, logs, the watchlist and From friends (see "Done in the cloud
session"), again after the launch pass (see "Done in the second cloud session"), and again back on the laptop, after
the design review was applied (see "Done in the third session"). Read this first, then `README.md`, which says what
every file is and how the Worker, the accounts and the tests are set up.

## Done on 6 October 2026 (our own, Gummo, marketing, phone first)

Nothing merged into `main`, nothing deployed, shelf.js's drawing untouched (story.js and the title page only use what
it draws), no key added anywhere.

- **SQL, proposed, not run:** `docs/proposed-0012-badges.sql` and its test `docs/proposed-rls_phase9.sql` (`ALL 0012
  CHECKS PASSED` on PGlite after 0001 to 0011; 0009, 0010 and 0011's tests still pass after it; the test fails against
  five broken copies of 0012: the 101st counted, the table readable, the order wrong, a hidden profile counted, badges
  kept after their profile is deleted). It adds a `badges` table (given by hand in the SQL Editor; no page can read or
  write it), `badges_of(names)` (each name's badges, and `early-100` for the first 100 profiles by signup order, private
  ones too), an index on `profiles (created_at, id)`, and gives @viraaj `founder`. Until it's run, badges.js uses its
  own list: Founder for @viraaj, Early 100 for the five public profiles on the live site today (viraaj, prathmesh,
  rudra, hardik, div; read with the public key). **A private profile that signed up before today has no Early 100
  until 0012 is run.** After running it and its test: move both into `supabase/` and set `FROM_DB = true` in badges.js.
- **The Worker, not deployed: it needs a deploy** (`cd worker && npm test && npx wrangler deploy`). New: the share links
  `/s/u/<name>`, `/s/u/<name>/<shelf id>`, `/s/t/film/<id>`, `/s/t/book/<id>` (see README's Worker table). The pages on
  this branch already copy and send these links, so **deploy the Worker before merging this branch**, or shared links
  answer 404. `cd worker && npm test`: 43 checks pass (6 new for the share links).

### Our own (Part A): every change that took out a Letterboxd copy

1. Profile tab **Network is People** (`#people`; `#network` still works), and **Activity is Posts** (`#posts`;
   `#activity` still works), here and in the account menu.
2. **No row of big numbers with capital labels.** The numbers are one plain line under the bio at every width
   ("9 spines · 3 following · 3 followers"), each a link, as the phone already had. Requests moved into the button row.
3. **The title page is shelf first:** the real spine (when the archive has one) and the cover stand on a short shelf
   line at the top, the title, year, director and runtime beside them, the actions in one row under them (on a phone
   the row scrolls sideways; Share is an icon). No poster | info | action box columns.
4. **The rating chart is piles of books, not bars:** five piles (one spine to five, a half counting up), each a stack
   of lying books in the logo's colours as tall as how many gave it, on one shelf line, with the count and the rating
   in spines under each. No ten-bar histogram.
5. **Words:** "Directed by" is **dir.**; "watched by 12 · 3 friends" is **"12 watched it · 3 friends have this"** (a
   friend has it when they logged it or shelved it); Reviews is **What people said**; Your review is **Your take**;
   the tabs Friends · Popular · Recent are **From friends · Most liked · Newest**; "On shelves (3)" is **On 3 shelves**;
   Up next's "You want to see 4 films and read 2 books" is **"4 films and 2 books waiting."**
6. **Up next on the Profile tab** (Letterboxd's four favourites in a row) is the covers leaning on each other on one
   short shelf line, up to six.
7. **The Up next tab** (a poster grid with the title laid over the cover on hover) stands its covers on shelf lines,
   the titles always under them.
8. **Home's "New from people you follow"** (their row of posters with an avatar under each) is **"Lately, from people
   you follow"**, every card standing on one long shelf line.
9. **The feed's "People to follow"** is **Follow these people**.
10. The README's "Letterboxd's habits are the rule" is gone; it says our own habits are.
- **Looked at and kept:** the heart for a like (everyone's, not theirs; we have no eye or watched icon); "Log" (our
  word for a post since phase 2); the Profile tab's name; "Followed by @a, @b"; the Shelves page (already spines on lines).

### Part B: the Gummo theme on @viraaj's profile

`themes.js` (data: `BY_USER = {viraaj: 'gummo'}`, and the theme's variables; a later Pro version reads the same from the
database). Only the profile card changes: a banner of faded lime-green siding with a light grain (CSS; to use a
picture, put it at `assets/themes/gummo/banner.jpg` and set `banner: 'banner.jpg'` in themes.js, which a test checks),
the card from bunny pink to wall mustard, the photo a crooked polaroid with tape over the banner's foot, the name on a
VHS label (siding green and sky stripe), the bio in Gochi Hand, Courier Prime for the rest, the card's grey text a dark
brown (6:1 or more on both ends of the gradient; a test computes it, and axe runs on the card). When the profile opens:
2 seconds of grain flicker and a blinking REC in the corner, once, then nothing; none with reduced motion; no sound.
No stills, posters or logo. 390px fits. Everyone else's profile is as it was.

### Part C: for marketing

1. **Share to story** (`story.js`, 1080 x 1920 PNG on a canvas): a shelf's Share, every post's Share and a profile's
   ···. Logo and name at the top, the shelf's spines on their line (or the log's worn cover, its rating and review, or
   the profile's photo, name, numbers and shelf), the title, @username, shelfstackd.com. On a phone that can share
   files: a sheet with the picture and **Share** (the press is the share sheet's own, which iPhone Safari needs; Android
   Chrome is happy either way), and Save the picture; anywhere else the PNG is downloaded. The shelf's old "Download
   image" (the builder's whole story) is kept.
2. **Invite links:** `shelfstackd.com/?invite=<username>` is kept in the browser (30 days) and taken off the address;
   signed-out home says "@viraaj invited you."; once the new account picks its username it follows the inviter, who
   gets the new-follower notification 0009 already sends. **Invite friends** in the account menu: the link, Copy link,
   Share to WhatsApp. No SQL. (A notification saying "joined through your invite" rather than "followed you" would need
   a new notification kind: not done.)
3. **Badges** (`badges.js`, `assets/badges/founder.svg` and `early-100.svg`: placeholders in the logo's colours, swap
   the files for the final art): see SQL above. A row of 22px squares 6px apart under the name on every profile; the
   most important one, 14px, beside the name on a post (feed, post page, title page); a tooltip with the name and one
   line on hover, focus, or a tap (a tap elsewhere or Esc shuts it). On a phone each badge's press area is 44px tall but
   only 28px wide (they're 6px apart, as asked), so they're left out of the 44px press test.
4. **Link previews:** the Worker's share links (above). Profile, shelf and title Copy link / Share to WhatsApp give them.
   A preview fetcher gets the right title, line and picture (the shelf's picture, the person's photo, the title's
   cover); a person is sent straight on to shelfstackd.com. Posts (`/p/`) still share their own address. Later, if you
   want the links on shelfstackd.com itself: proxy the domain through Cloudflare and serve these tags from a Worker
   route there (needs the DNS orange-clouded, which GitHub Pages' certificate doesn't like), or add `s.shelfstackd.com`
   as a second custom domain in `wrangler.toml`.
5. **Empty states:** an empty Friends tab says so, then **Log your first film** (black, opens Log it; only while you've
   logged nothing) and **Follow these people**, then Everyone; an empty Everyone has Log your first film too; an empty
   Recs tab (For you or Sent) says "Recommend something to a friend." with **Recommend** (+ ADD's Recommend).
6. **About** (`/about/`): five lines, who made it (with a link to @viraaj), and the Credits. Every footer's About goes
   there (it went to privacy.html's Credits, which stay too).

### Part D: smooth, phone first

- The profile's open tab is brought into the tab row's view (the row scrolls, the page doesn't): `Nav.tabInView()`.
- Every button, text action, tab and badge sinks 1px when pressed; a solid one darkens. A button put out of use while
  it saves turns (a small spinner in place of its words) once the save takes over 150ms, and comes back when done
  (`nav.js`, for every page); every save already puts its button out of use, so nothing is sent twice (tested).
- A profile draws at once: a skeleton the card's size, or the card as it was last time (kept in this browser a week),
  then the real one; the feed draws three posts' worth of skeleton while its first page is read. Photos and the title
  page's cover have their width and height before they load.
- Search's book covers were already small and through the Worker with paper under them (5 October); unchanged.
- **The whole flow** (`specs/flow.spec.js`, both widths): sign up → build a shelf → log a film with a review → edit it
  → recommend it → share it as a story → search → a title's page → follow someone, with no console error or warning.
  `watchErrors()` (every page test that uses it) now fails on warnings as well as errors.
- Bugs found and fixed on the way: the Share menu on a title's phone action row was cut off (it now sits on the screen
  by its button); with the numbers moved under the bio, "add a bio" and "more" were too close to them for two 44px
  presses on a phone (32px between them now, touch screens only); search's covers now show only once whole (the paper
  and title under them until then, never half a picture); the empty feed's line was matched twice by the tests once Log your first film was added; a new
  profile POST in the test mock answered with the wrong person.

## Done on 5 October 2026 (design pass)

No SQL, nothing for the Worker, shelf.js's drawing untouched. Each item its own commit.

1. **+ New shelf is a button:** a third button look, `.btn.line` (black on white, a 1px line drawn inside with
   box-shadow so the padding stays 8px 16px, the solid one's box), with its +, on the Shelves page, your Shelves tab,
   the builder and + ADD's ▾. `look.spec.js` now allows three looks (solid, outlined, text) and no fourth.
2. **The Shelves tab:** a grid (three across, two under 820px, one on a phone) of compact shelves: spines 112px (the
   feed's height) on a line as wide as they are and 16px more, the name, then Main shelf / Private as grey states, the
   count and date; 16px under the tabs, 24px to the first; yours end with a dashed "+ New shelf" slot.
3. **The Filter row:** every filter 64px wide, 8px apart, the name on one line (… when long), PRO on its own line, 8px
   of room at both ends. Tab rows and home's card row have room after their last item (the spine wall doesn't: it's
   centred when it fits).
4. **Feed shelf posts:** spines 112px, the line as wide as the spines and 16px more (48px at least, to press).
5. **Search covers:** the small cover (Open Library medium, TMDB 185px) through the Worker; under it paper with the
   title, which is what shows with no cover or one that fails. Live, Open Library covers took 3 s at the large size and
   1.5 s at medium, which is why they looked like grey boxes.
6. **Spacing:** a shelf's page and the post page start 24px under the bar like every page (were 48 and 26); "Add a
   photo" centred inside its circle; title page sections 24px apart on a phone; recs and From friends with no cover
   show paper and the title. `specs/fit.spec.js` checks every page and sheet at both widths.
- **Tested:** `cd tests && npm run test:all`: html-validate clean, then Playwright 978 passed, 24 skipped, none failed.
- `tests/shots.js` covers the Shelves tab, title, post, notifications, people, Style, search, + ADD's ▾ and the
  Recommend sheet now, and takes `node shots.js [folder] [names]`; its Up next shot had been broken since the rename.

## Done on 5 October 2026 (ids, edits, one search)

- **SQL, not run:** `docs/proposed-0011-ids-edits.sql` and its test `docs/proposed-rls_phase8.sql` (`ALL 0011 CHECKS
  PASSED` on PGlite after 0001 to 0010; 0006 to 0010's tests still pass after it; the test fails against three broken
  copies of 0011). Run 0011, then the test, in the SQL Editor; once it passes, both move to `supabase/` with only their
  headers changed. Additive: nullable `tmdb_id`/`ol_id` on logs, shelf_items, watchlist and recs, `logs.edited_at`, an
  update policy on your own log (rating, review, spoiler, rewatch, watched_on, and the ids once).
- **The Worker, not deployed:** nothing changed in `worker/` this time, but Phase 5's `/identify` ids (cache key `id8`)
  and `/title` still aren't live, and the ids depend on them: until `cd worker && npx wrangler deploy`, search results
  have no id to save, and no old row gets one filled in.
- **1. Ids** (with 0011; `Nav.ids()` asks): new logs, spines, Up next and recs keep the id; the title page matches by id,
  then by kind, title and year for old rows; your own old rows get their id when you open them (`Nav.fillIds()`).
- **2. The live Gummo bug:** the title page's two reads embedded `profiles()` bare, which PostgREST refuses (PGRST201,
  checked against the live API with the publishable key, read only), so logs and spines both came back empty. They
  name the foreign key now; the mock refuses a bare embed the same way, and reads PostgREST's `or=(...)` filters. The
  sheet says "Already on <shelf>" in one line.
- **3. Edit your own log** (with 0011): Edit beside Delete, the fields filled in on a sheet, "edited" beside the time;
  Your review on the title page edits your log once you have one.
- **4.** Home's follow cards and notifications' titles go to the title page; a notification's time goes to the post.
- **5. One search** (`search.js`): the bar's icon opens it; Films, Books, People; recent searches on this device.
- **Tested:** `cd tests && npm run test:all`: html-validate clean, then Playwright 912 passed, 24 skipped, none failed. New specs: `ids.spec.js`, `edit.spec.js`, `search.spec.js`.
- **My calls:** the update grant includes the two ids (for filling them in; an id can't be changed once set); a log's
  id is filled in only when the Worker's title is the row's (and the year within one), so a crafted link can't put the
  wrong id on your rows; Up next refuses a second of the same id (a unique index); See all opens the rest of a group in
  place (the Worker gives five films and five books, so it shows for People more often than for titles); a home card's
  date isn't a link (a 44px press there would cover the card).

## Fixes from the live test (5 October 2026)

1. A row of tabs is one line that scrolls inside itself (44px tall tabs on a touch screen); a test that no page is wider
   than 390px with every tab there. 2. New shelf on Shelves, your Shelves tab and + ADD's ▾. 3. Put on shelf says which
   shelf (a picker, main first, with more than one). 4. Never the same title twice on one shelf ("Already on <shelf>");
   existing duplicates are left. 5. The title page's address keeps the link's title and year, and matches by them.
   6. Recommend to up to 5 at once. 7. The title page draws the link's title, year, cover and your status at once.
   8. One box for every action (`.btn`, `.dash`, `.state`: 8px above and below, no border), and a test that action rows
   line up. Full suite: html-validate clean, 866 passed, 24 skipped.

## Done on 5 October 2026 (phase 6: material wear)

- `wear.js` draws a logged film as a DVD keep case and a logged book as a paperback (see README); every caller passes
  the log's kind (no kind: a paperback). This was the one planned change to wear drawing; shelf.js and the spines are
  untouched. `specs/wear.spec.js` is rewritten for both. No SQL, nothing for the Worker.
- **Tested:** `cd tests && npm run test:all` after Phase 6: html-validate clean, then Playwright 830 passed, 24
  skipped, none failed; `cd worker && npm test`: 38 checks.
- **My calls:** the pencilled price is £ or $ with a made-up amount, in Gochi Hand where the page has it (a cursive
  otherwise), at the top left (the dog-ear is top right); on a dark cover it's faint, as pencil is. The crack is at
  one of the four corners, the chip taken out of the plastic (see-through there).

## Done on 5 October 2026 (phase 5: the title page)

- **Worker, not deployed:** `/identify` gives each film its TMDB id and each book its Open Library work id (its cache
  key is `id8` now, so answers are asked for again once), and `GET /title` (details for the page, its archived spine;
  edge-cached a week, no KV write). `cd worker && npm test`: 38 checks pass. Until it's deployed the title page shows
  what a link says (title, year) and everything people did with it, without the director, runtime, genres, overview or
  spine. To deploy: `cd worker && npx wrangler deploy`.
- **The page:** `/t/` (`t/index.html`), linked from every title (`Nav.titleUrl()`): see README. No SQL: it reads the
  logs and spines with the same kind, title and year (what RLS lets you see), so a title spelled differently in two
  logs counts as two.
- **Tested:** `cd tests && npm run test:all` after Phase 5: html-validate clean, then Playwright 826 passed, 24
  skipped, none failed.
- **My calls:** "Your review" rates and then posts in one go (a log can't be edited after, with no update policy on
  logs); the reviews are logs with a rating or something said, 20 a tab; Up next isn't offered once you've logged it.

## Done on 5 October 2026 (phase 4: recs)

- **SQL, run:** the owner ran `supabase/migrations/0010_recs.sql` and its test `supabase/tests/rls_phase7.sql` in the
  SQL Editor (`ALL 0010 CHECKS PASSED`); both moved from `docs/proposed-*` with only their headers changed. Nothing
  for the Worker.
- **The pages (shown only once 0010 answers, `Nav.loadRecs()`):** `recs.js`, the Recommend sheet (the people you both
  follow, a note of 140, Show in feed, Send, Share to WhatsApp), on a post's share menu, + ADD's fourth choice, a
  shelf's spines, Up next and From friends; the profile's Recs tab (counts for anyone; For you and Sent on your own,
  with Keep, Mark watched, Dismiss and a private thread); the feed reads `timeline()` (recs in it, never the note) and
  a log from a rec says "recommended by @a"; notifications for a rec, a rec watched and a thread reply.
- **Share to WhatsApp:** posts' share menu, the Recommend sheet and a shelf's Share (works without 0010).
- **Tested:** `cd tests && npm run test:all` after Phase 4: html-validate clean, then Playwright 785 passed, 23
  skipped, none failed.
- **My calls:** a rec the receiver let go shows "Passed" in the sender's Sent; Share to WhatsApp on a rec is the
  sheet's (a rec itself is private); a rec in the feed has no page of its own yet (the title page is Phase 5).

## Done on 5 October 2026 (phase 3 of the owner's plan, and 3a before it)

No new SQL, nothing for the Worker. Each item its own commit on `letterboxd-flow`.

- **3a, the feed redesign.** One 600px timeline, sticky Friends · Everyone, a tweet-box composer, posts like tweets
  (photo, name @user · 2h, the title in bold, a spine rating, the worn cover 72px at the right, reply · Same · like ·
  share), shelf saves as compact posts with a strip of the new spines, ratings as 1 to 5 spines in the logo colours,
  our own words (Up next, People, Same, Friends · Everyone; old addresses still work), People to follow on an empty
  Friends tab.
- **More than one shelf again.** The profile shows the main one (pinned, otherwise the oldest); a Shelves (N) tab lists
  them all; New shelf in the builder; + ADD asks which shelf; Make main, Rename and Delete on your shelf's page; the
  feed names the shelf. No SQL: `profiles.pinned_shelf_id` (0002) is the main one.
- **Phase 3.** Two button looks (solid black, or grey text that's black on hover; Following grey, Unfollow on hover);
  Delete, Remove and Clear ask first on the page's own sheet; actions start with a verb (Go home, See all, Show
  spoilers, Add to Up next, Add to my shelf, Add a photo, Edit your shelf); one icon set (Lucide, stroke 2, 16 or
  20px; no glyph or emoji for one); one 8px spacing scale (the 12px step is 16 now; buttons 8px 16px); the welcome
  line 22px, 20px on a phone; one section label (h2, and `.seclabel`); no boxed cards round shelves (spines on a thin
  line, `Bare.tile` and `Bare.lines`; `cards.js` is gone); covers with a 1px outline, black on hover; Just shelved
  with fewer than three shelves puts each across the column on one long line. Phase 3 item 12 wasn't in the plan.
- **Tested:** `cd tests && npm run test:all` after Phase 3: html-validate clean, then Playwright 749 passed, 23
  skipped, none failed.

## Done on 4 October 2026 (phases 0 to 2 of the owner's plan)

Live data had 4 people with shelves (all films, no books) and no logs. The plan: the logo, book spines, then the feed
as posts. Each item is its own commit on `letterboxd-flow`; nothing is merged into `main`.

- **Phase 0, the logo.** `assets/logo-hedgehog.svg` is the favicon (SVG, 32px, 180px on #14181C), the bar's mark
  (28px left of SHELFSTACKD) and `og.jpg` (the logo in the middle of #14181C). The bar's ⚡ is the word FEED.
- **Phase 1, book spines.** `docs/BOOK-SPINES.md` is the diagnosis (six books through the live Worker and the page's
  own cutter). Then: a book's rounds are round 0, `"<title>" <author> book spine`, `"<title>" <author> dust jacket full
  wrap`, each only while there's still no clean spine; a book's cut must have lettering down its length (Animal Farm's
  false strip is dropped); one spine alone at 1:6 or narrower is the whole spine; no real spine gives "Have it?
  Photograph the spine" first, Generated next; authors as they write their name (Haruki Murakami); search ranks the
  title as typed, then starting with it, then the rest, in the Worker over TMDB's and Open Library's whole answers
  (Gummo when typing "gumm"; 1984 finds Nineteen Eighty-Four) and on the page and Members.
- **Phase 2, the feed as posts.** `supabase/migrations/0009_social.sql` and its test `supabase/tests/rls_phase6.sql`
  (run on the live database by the owner, the test passing): a log's rating, review, spoiler, rewatch, watched_on and
  metoo_of; likes, replies, notifications, limits and reports. `post.js` (the composer and a post), the feed's composer and posts with their actions, + ADD
  opening on Log it (Put on shelf on the builder), Log on every title, `/p/` (a post and its replies),
  Following · Everyone with the next 20 as you scroll, "N new posts", People to follow, the bell and
  `/notifications/`. Everything 0009 adds shows once the likes table answers, which it does now.
- **Deployed and run.** The owner deployed the Worker with these changes (book rounds, `/identify` cache key `id7`:
  authors and ranking) and ran 0009 in the SQL Editor, where its test passed (`ALL 0009 CHECKS PASSED`). The two SQL
  files moved from `docs/proposed-*` to `supabase/`, with only their headers changed. Before that they were also run on
  PGlite (Postgres 18.3 in WASM, after 0001 to 0008 with a stand-in for Supabase's `auth`), with 0006 to 0008's own
  tests passing after them.
- **Tested:** `cd tests && npm run test:all` on the laptop after Phase 2: html-validate clean, then Playwright 711
  passed, 21 skipped, none failed. Nothing is merged into `main`: that's the owner's.

## Where things stand

- **Branch:** `letterboxd-flow`, pushed to `origin` (github.com/reflexgod/spinestack). It has everything from the
  older local branches in it (`phase2-profiles`, `phase3-feed`, `profile-polish`, `domain-move`, `drop-fallback`), so
  no other branch needs pushing.
- **`main` is the live site, and it has this branch as it was at `b9adc3b`.** The owner merged it on 2 October 2026
  (the merge commit on `main` is `be5a44b`), so shelfstackd.com now has one shelf each, logs, the watchlist, From
  friends and the design review. The branch is 5 commits ahead of that: the four fixes from the live test (see "Done
  after the live test") and this note. They aren't live until the owner merges again. **A session doesn't merge into
  `main`**: the owner does.
- **The Worker is deployed by the owner, by hand, from this branch.** On 2 October `https://api.shelfstackd.com/health`
  listed all four scan providers, so the provider chain (`848541c`) is live. The Serper fix after it (`3774d06`) was
  deployed and checked live the same day, and nothing in `worker/` has changed since: **nothing is waiting to be
  deployed.**
- **The working tree was clean** when this was written.
- **Migration `0007` is in the live database.** The owner ran it on 2 October 2026 (`docs/RUN-0007.md`, steps 1 to 5:
  the checks all `true`, then `ALL PHASE 4 CHECKS PASSED` and `ALL PHASE 3 CHECKS PASSED`), and a session did step 6
  from outside with the publishable key: `activity()` answers a visitor with the feed, and `from_friends()` and
  `log_counts` answer "permission denied". The SQL is `supabase/migrations/0007_logs_watchlist.sql` and its test
  `supabase/tests/rls_phase4.sql`. This branch's pages use logs, the watchlist and From friends as soon as the
  database has them, so they do now; the live pages are `main`, which doesn't ask for them, until the merge. Not tried
  yet: a signed-in page of this branch against the live database (nobody has logged anything; `docs/LAUNCH.md` step 7
  does it on a phone after the merge). `docs/proposed-0007.md` says what each page asks.
- **Migration `0008` is in the live database too.** The owner ran it on 2 October 2026 and its test passed:
  `supabase/migrations/0008_watchlist_privacy.sql` (`profiles.watchlist_public`, false for everyone, and the watchlist
  read policies that ask `watchlist_is_public()`), test `supabase/tests/rls_phase5.sql` (`ALL 0008 CHECKS PASSED`).
  Every watchlist is now private until its owner presses Make public on their Watchlist tab. `rls_phase4.sql` makes its
  private D's watchlist public (one line, next to the one that makes D private), so it needs `0008` as well.

## Rules

These are the owner's standing rules. They apply to every change, in any session.

1. **Our look.** Every page uses `site.css` and its variables, and nothing else for shared things: black ink on white
   paper, Courier Prime (Geist Mono only on canvases shelf.js draws), one 950px column that the top bar's contents share, the type scale in `:root`, only the
   4/8/12/16/24/40 spacing, the 3px radius, one black button a screen, shelf cards 2:3 and six across (three on a
   phone). A page's own `<style>` holds only what that page alone needs. No build step and no framework; a library only
   from `cdn.jsdelivr.net` at an exact version with an `integrity` hash. Copy is plain English: no em dashes, no
   rule-of-three lines, no "lets you" tiles. `tests/specs/look.spec.js`, `libraries.spec.js` and the copy checks in
   `site.spec.js` hold most of this in place; keep them passing rather than changing them to fit.
2. **No new migrations without asking.** `supabase/migrations/` stops at `0008` (there is no `0003`). If a feature
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
- **A shelf's own page:** its heading, Share (Share to story, Download image, Copy link), On this shelf with Add to my
  shelf, and for its owner Edit, Make main, Make private or public, Delete.
- **Shelves listed** (home's Just shelved, Shelves): no card and no box; each is its first spines standing on a thin
  line (`bare.js`, Bare.tile and Bare.lines), its name and @username under. `cards.js` (2:3 cards cut from the story
  picture) is gone. Covers have a 1px outline, black on hover. Hovering a spine on a shelf's picture names it
  (`spinetip.js`).
- **Every page:** a favicon, a share picture, its own title and description; an empty site says so in a line.
- **The Worker:** `/identify` drops Open Library's government reports and books that don't have what was typed
  (cache key `id4`), and takes `suggest=1` for half-typed titles. `/scans` looks with Serper, then SerpApi, then Brave,
  then archive.org, each with a daily cap counted in the `Archive` Durable Object; `/admin/usage` and `/admin/raw`.
- **The Serper fix (`3774d06`, the last code commit).** Serper answers 400 to a search with double quotes in it, so
  every Serper search was failing and going on to SerpApi. It is now asked without the quotes, asked once more with a
  plainer search if it still answers 400, and a 400 never puts it out for the day. See "Where scans come from" in the
  README.

## Done in the cloud session (2 October 2026)

What the owner asked for, and where it is:

1. **One shelf each, "Shelf".** No Shelves tab, no "+ new shelf", no Make main, no main shelf in Settings, no "Save as
   a new shelf". The builder ("Your shelf") opens your shelf when you're signed in and saves over it; + ADD's Put on
   shelf adds after what's there; spines put on before signing in go on your shelf once you are. The account menu's
   Shelves is Shelf (`/u/?you&shelf`). Your shelf is the main one if one was picked before, otherwise the one saved last
   (the same rule in `build/` and `u/`). No migration: accounts with more than one shelf keep them in the database, and
   the end of `0007`'s SQL has the (commented out) index that would make one a rule.
2. **Logs on the feed.** `+ ADD → Log it`: the cover, a caption if you want one, Post. The feed says "@user watched
   Gummo · today" (or "read"), with the cover drawn by `wear.js`: a dog-eared corner, fine scratches, rubbed edges and a
   little fade, nearly new that day, more faded after a week, more worn after a month, worked out from the log's date on
   a canvas. No stamp, no text on it. Your own logs have Delete on your profile's Activity.
3. **+ ADD offers three choices:** Put on shelf · Log it · Watchlist, at the top of the dialog, Put on shelf first.
   Log it and Watchlist never search for spines.
4. **Profile: Watchlist (6 at most) and From friends (6 at most)**, rows with Keep · Remove · Watched / Read (Keep
   only in From friends; Watched for a film, Read for a book, which opens Log it on that title). From friends is the
   people you follow's recent logs, only on your own profile.
5. **Most shelved is gone; the profile's shelf is a big hero** across the column on the wash; on a wide window the
   shelf page's On this shelf sits to the right of the story.

Also: `privacy.html` says what logs and the watchlist keep and who sees them; the sign-in sheet's line no longer says
"shelves"; long shelf names no longer push the profile and the shelf page wider than a phone (that was the 11px
overflow on your own profile at 390px).

## Done in the second cloud session (2 October 2026)

Each item is its own commit, so any one can be reverted.

- **A. The proposed 0007, hardened** (run since, on 2 October): the logs and watchlist triggers take a per-person advisory lock
  before counting (two tabs at once can't beat a limit); 50 logs a day counts what was posted (`log_counts`, an upsert
  under the lock), not what's left; From friends keeps 500 removals a person; unfollowing clears `watchlist.from_user`;
  a hidden log can't be deleted by its owner. Each has a check in `supabase/tests/rls_phase4.sql` that fails against
  the SQL without it, all run on a local Postgres. `docs/RUN-0007.md`: the exact SQL Editor steps and checks, and an
  undo.
- **B. The launch pass** as a new account on a 390px phone and at 1280px, fixes only:
  - signed in with no connection, a page no longer takes you for an account with no username (`offline.spec.js`);
  - a new account's empty places each say what to do next, "add a bio" on a phone too (`newuser.spec.js`);
  - every control takes a 44 × 44px press on a touch screen, and fields are 16px so iOS doesn't zoom
    (`taps.spec.js`), with nothing changed for a mouse;
  - the feed's link preview says shelves and logs, and `meta.spec.js` checks the preview tags;
  - a failed search no longer leaves the last search's titles to pick.

  What was found and left is in `docs/FOUND-NOT-FIXED.md`.
- **C. `docs/DESIGN-REVIEW.md`**, with pictures in `docs/review/`: the design questions, each with a suggested fix.
  Nothing in it is changed.
- **D. `docs/LAUNCH.md`**: the owner's launch steps in order, with commands.

## Done in the third session (2 October 2026, on the laptop)

The owner's answers to the design review, applied. Each item is a commit of its own, and each one reverts cleanly by
itself (`git revert <commit>` was tried for every one, on a copy of the branch).

- **1.** A shelf's page shows the shelf on the grey panel, as the profile's hero does, not the 9:16 story. The story
  is only made for Share.
- **2.** A log's cover on the feed and in Activity is 72 x 108px (`--cover` in `site.css`), with the caption beside it.
- **3.** Wear starts at 0.25, the first three scratches always show, and the dog-ear has a hairline and a soft shadow
  (`wear.js`). The same log is still drawn the same way every time.
- **4.** Not done, by the owner's choice: the bar still says SHELVES.
- **5.** The Add dialog's titles have no ellipsis, and what the search says sits on the All · Films · Books row.
- **6.** Signed-out home: the newest public shelf, large, then one line and Make a shelf in black (the bar's + is
  outlined on that screen), and How it works in three steps, which is nowhere else now.
- **7.** Every page's footer is two lines of small print: TMDB's line, Open Library, Search by Brave, Privacy,
  hello@shelfstackd.com.
- **8.** On a phone a profile's numbers are one small line of links under the name.
- **9.** No ellipsis on a placeholder or a menu item. Home's welcome line keeps its one.
- **10.** The bar's places are ⚡ · SHELVES · MEMBERS · search, signed in or out.
- **11.** 12px more between the bar's two rows on a phone, so the logo takes a press.
- **12.** One name in the builder: Style's Caption is gone, and the Name is the story's caption.
- **13.** The way back is plain grey text, small actions are dashed, the ones that lose something are grey, and Clear
  asks first.

Also in this session:

- The builder's Cancel and Save stay side by side on a phone. This was the one `taps.spec.js` check failing on the
  laptop, and a real fault on phones a little wider than 390px.
- `docs/LAUNCH.md` step 5: the Worker needs no deploy (the Serper fix has been live since 2 October).
- New `?v=` versions on `site.css`, `nav.js`, `add.js`, `wear.js` and `spinetip.js`.
- The README, this file, `docs/FOUND-NOT-FIXED.md` and the top of `docs/DESIGN-REVIEW.md` were brought up to date in
  one commit at the end, not item by item, so that the item commits revert cleanly. After reverting an item, its lines
  in the README need putting back by hand.
- `docs/review/after/` has pictures of 1, 2, 3, 6, 7 and 8 as they are now.
- After the owner ran `0007` the same day: `docs/RUN-0007.md` steps 6 and 7 (the three checks from outside as a
  visitor, then the SQL and its test moved into `supabase/`, with only their headers changed).

Left as it was, for the owner to decide: renaming a shelf on its own page or on the profile still changes only its
name, so its story keeps the old caption until the shelf is next saved in the builder (12 made the two one there).

## Done after the live test (2 October 2026)

The owner merged into `main`, tried the live site, and found these. Each is its own commit on `letterboxd-flow`, with
tests, waiting for the owner's next merge.

1. **Home no longer tells someone with a shelf to start one.** With nothing from the people you follow, home looks
   whether you have a shelf: with one it's still "Welcome back" and "Follow a few people to see their shelves here.";
   only someone with no shelf gets "Welcome" and the Start your shelf line.
2. **A shelf's page doesn't offer a title to a shelf that has it.** Your own shelf has no + ADD TO MY SHELF beside its
   titles; on someone else's, a title that's on your shelf says "On your shelf" in grey.
3. **Home's "New from people you follow" has logs too.** It asks `activity()` (`feed()` on a database without it) and
   draws the newest six as the feed does: a log with its small worn cover and caption, a shelf with its card, two
   across on a wide window.
4. **The footer is one line**: About · Privacy · hello@shelfstackd.com. The credits are a Credits section at the end
   of `privacy.html` (About goes to `#credits`): TMDB's logo (`tmdb.svg`, their file, unchanged) over their line, Open
   Library, Search by Brave. The Add dialog says "Search by Brave" under the spines a search found. `site.css` and
   `add.js` are at `?v=20261005a`.

## What's tested

Both suites were run on 2 October 2026 on the laptop (Windows 11, Node 26).

- **The Worker's providers:** `cd worker && npm test`, 21 checks, all passing at `3774d06`. They run the real Worker
  code in Miniflare against made-up providers, so they need no key and spend nothing. The made-up Serper answers 400 to
  double quotes as the real one does; run against the code before the fix, the first check fails.
- **The pages:** `cd tests && npm run test:all` (html-validate, then Playwright at 1280px and 390px, with axe).
  html-validate clean, then 397 passed, 11 skipped, none failed, in about 4 minutes. The skipped ones are checks that
  belong to one width only (a mouse on the phone project, and the like). This run was at `848541c`; the two commits
  after it changed only `worker/`, `README.md` and `docs/`, which the page tests don't read.
- **In the cloud session, after the work above** (Linux, Node 22): html-validate clean, then Playwright 431 passed,
  11 skipped, 4 failed. The 4 are `requests.spec.js` at both widths, signed in and out: this container's Chromium
  cancels the browser's own icon loads when the test goes to the next page, and reports them as failed. Before any
  change they failed the same way here (with one more: the 11px phone overflow, now fixed), so they're the container's
  Chromium, not the pages; the laptop's run is the one to confirm them. New specs: `log.spec.js` (+ ADD's three
  choices), `wear.spec.js` (the worn cover); `build`, `profile`, `shelf`, `feed`, `settings`, `look`, `cards`, `a11y`,
  `meta`, `privacy`, `site`, `shelves` and `empty` changed with the pages. The Worker's suite wasn't run: nothing in
  `worker/` changed.
- **After the second cloud session** (same container): html-validate clean, then Playwright 458 passed, 16 skipped,
  4 failed, the same 4 `requests.spec.js` checks (the icons' loads, cancelled by this container's Chromium), and
  `npm run shots` made all 50. New specs: `taps.spec.js`, `offline.spec.js`, `newuser.spec.js`.
- **After the third session** (the laptop: Windows 11, Node 26, the Chromium that Playwright 1.63 asks for):
  html-validate clean, then Playwright 484 passed, 20 skipped, none failed, `requests.spec.js` included, and
  `npm run shots` made all 50. The Worker's suite wasn't run: nothing in `worker/` changed.
- **After the live test's fixes** (the laptop, the same day): html-validate clean, then Playwright 508 passed, 20
  skipped, none failed. Not tried against the live site: these four fixes aren't on it until the next merge.
- **`0007`'s SQL** was run on a local Postgres 16 first (a stand-in for Supabase's `auth` schema, then `0001` to
  `0006`, then `0007`): no errors; `rls_phase3.sql` and `rls_phase4.sql` both passed. Then on Supabase, by the owner, on
  2 October: the same two tests passed in the SQL Editor, and the three visitor checks of `docs/RUN-0007.md` step 6
  answered as they should (the feed as a list; "permission denied", code 42501, for `from_friends` and `log_counts`).
- **Not tested by anything here:**
  - The real providers. That Serper answers 400 to quotes and 200 without them is what the owner saw calling it with
    their own key. The fix is deployed, and the owner checked it against the real Serper on 2 October; no session has.
  - Whether SerpApi minds quotes. Its documentation says quoted phrases are fine in `q`, and its request is built
    differently (a GET with `q` URL-encoded), but no real call was made: no SerpApi key is on any machine a session can
    read. See the open tasks.
  - The database. `supabase/tests/rls_phase3.sql` is run by hand in the Supabase SQL Editor. It wasn't run in the last
    session, and the repo doesn't say when it last was.

## Open tasks

This list is what the repo and the last session show. Anything the owner asked for in an earlier conversation that
never reached a commit isn't here, so ask before assuming the list is complete.

0. **Launch: `docs/LAUNCH.md`** (the owner) has the order: run 0007 (done), publish the Google sign-in, hello@ with
   Cloudflare Email Routing, a Brave spending limit, merge into `main`, test on a phone (the Worker needs no deploy:
   step 5 there only checks that). Tasks 6
   and 7 below are steps in it. **The design review** (`docs/DESIGN-REVIEW.md`) is applied, all but 4 (see "Done in
   the third session").
   `0007` was run as it was written: a watchlist of 6, 50 logs a day, 180 days of From friends. `0008` (run the same
   day) made each watchlist private until its owner makes it public.
   Still open in `docs/proposed-0007.md`: whether to make one shelf each a rule in the database (the index at the end
   of the SQL is commented out, and wasn't run).

1. **Done: the Worker with the Serper fix is deployed** (the owner, 2 October 2026) and checked live. Nothing in
   `worker/` has changed since, so there is nothing to deploy. After any later change to `worker/`, the owner runs
   `cd worker && npm test && npx wrangler deploy`, then looks at `/health`.
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
5. **"Search by Brave" is under the spines in the Add dialog** and in `privacy.html`'s Credits (it was in every
   footer). Serper and SerpApi (both Google Images) are asked before Brave, and the dialog can't tell which of them
   found a scan, so the line shows whenever spines were searched for. Whether Serper or SerpApi need a line of their
   own is the owner's call. `tests/specs/add.spec.js` checks the line, so the test changes with it.
6. **Merging into `main`** is the owner's. The first merge was on 2 October (`be5a44b`). The four fixes from the live
   test are next: run both test suites, then merge as `docs/LAUNCH.md` step 6 has it. (The live database has `0004`
   to `0008`.)
7. **Done: the page tests were run on the laptop** on 2 October, and `requests.spec.js` passes with the Chromium
   Playwright 1.63 asks for (it failed in the cloud container only because of an older Chromium). Run them again
   before the merge, as `docs/LAUNCH.md` step 6 says.

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
- An older Chromium. Playwright 1.63 asks for build 1243; the container has 1194 in `/opt/pw-browsers` (and mustn't run
  `playwright install`). The cloud session pointed `PLAYWRIGHT_BROWSERS_PATH` at a folder of its own with
  `chromium-1243/chrome-linux64` and `chromium_headless_shell-1243/chrome-headless-shell-linux64` linked to the 1194
  folders (and a `chrome-headless-shell` link beside `headless_shell`). With it, everything runs except the 4
  `requests.spec.js` checks above.
- Postgres 16 is installed (`/usr/lib/postgresql/16/bin`), which is how `0007`'s SQL was checked before it was run: a throwaway
  cluster run as the `postgres` user, outside the repo.
- The folders `design/`, `textures/raw/`, `worker/debug/` and `tests/shots/` are not in the repo (`.gitignore`).
