# A busy day: what holds, what breaks, what it costs

Written on 6 October 2026 for a possible r/InternetIsBeautiful launch (500 people in 10 minutes, or thousands in a
day). Prices are the providers' published ones as of this writing; check each page before paying.

## The rehearsal

`cd worker && node test/load.mjs` runs the Worker (src/index.js, in Miniflare) against made-up TMDB, Open Library,
scan providers and image hosts with their usual delays (Open Library about a second, one ask in eight three times
that), with the live scan caps. Each visitor does what make/ does: types each of 8 titles (two suggestions), picks
it, asks /scans round 0 with its id, loads the scans or only the found ones and the cover through /img, and tells
/found what it cut. Titles are picked the way people pick: a few popular ones, a long tail (600 titles).

Run on 6 October 2026: 500 visitors, 10 minutes squeezed into 2 (`--speed 5`, so five times as busy as the real thing):

| | requests | p50 | p95 |
|---|---|---|---|
| /identify (typing) | 8,000 | 163 ms | 1,284 ms |
| /scans | 4,000 | 154 ms | 1,132 ms |
| /scans (cacheonly) | 3,827 | 257 ms | 1,195 ms |
| /img (cover) | 4,000 | 153 ms | 1,152 ms |
| /img (scan) | 1,737 | 401 ms | 968 ms |
| /found | 61 | 186 ms | 665 ms |
| all | 21,625 | 43 a visitor | |

- **Worker errors:** 1 (a 504: a scan host made up to be slow, given up on at 8 s). About 3,500 asks failed on this
  laptop itself (Windows running out of local ports at five times the load), not in the Worker.
- **Of 4,000 titles picked:** 1,676 loaded only the scan someone had cut before (found); 781 came after every scan
  cap was used and were told so at once (capped: the spine made from the cover); 83 were still being searched after
  6 s (pending, then the cover's spine). The page always has the cover's spine to pick within 2 s.
- **Scan searches:** Serper 100/100, SerpApi 8/8, Brave 30/30, archive.org 100/100: the day's caps go in the first
  few minutes. After that, a title that wasn't found before gets the cover's spine at once, with nothing asked.
- **Upstream:** TMDB 853 asks, Open Library 498, Wikidata 218 for 8,000 typed searches (kept at the edge, and
  directors, authors and years remembered by each Worker copy).

## What breaks first, and the fix

1. **Workers Free: 100,000 requests a day, then every request fails until midnight UTC** (search, pictures, share
   links, photos: the whole Worker). At ~43 requests a visitor making a shelf, that's ~2,300 visitors; a signed-out
   home view adds up to ~40 more (its spine wall's pictures), so a few thousand visitors in a day is the end of it.
   **Fix: Workers Paid, $5 a month**: 10 million requests a month included, then $0.30 a million; also lifts CPU time
   (10 ms to 30 s a request), KV to 10M reads / 1M writes a month, and the Durable Object to 1M requests a month. A
   launch day of 10,000 visitors is about 0.5M requests: inside the $5.
2. **Scan search caps** (Serper 100, SerpApi 8, Brave 30, archive.org 100 a day). Not an outage: titles past them get
   the cover's spine at once, and every title found once is shared with everyone (KV and POST /found), so the
   popular ones keep their real spines. **Optional fix:** Serper credits, about $50 for 50,000 (a search here costs 2
   credits: ~25,000 searches); then raise `SERPER_DAILY_CAP` (and `SERPER_TOTAL_CAP`) in wrangler.toml and deploy.
   500 a day would give most launch-day titles a real spine.
3. **Per-address limits.** 30 searches a minute per address was about three people behind one campus or phone-network
   address. Raised to 120 (and images 150 to 300) in wrangler.toml. Free; takes effect on deploy.
4. **KV's 1,000 writes a day** (free plan). Saved shelves' pictures were capped at 600 a day in all for this, so
   about 50 shelves saved to profiles a day. Moved to R2 (the MEDIA bucket, already bound; free up to 1M writes and
   10 GB a month) and the cap raised to 20,000 a day. Identify answers are no longer written to KV. Free.
5. **/img out of memory (Cloudflare 503, its 1102).** Pictures are streamed now, and covers are kept in R2 and served
   from there when TMDB or Open Library fail. Free (R2 within its free tier: a cover is ~100 KB, 10,000 is 1 GB).
6. **Supabase (free plan):** make/ never touches it. Home, Shelves and profiles read it (about 3 reads a home view);
   sign-ups go through Google. The free plan's limits (500 MB database, 5 GB egress a month, 50,000 monthly active
   users, a small shared server) are far above a launch day's reads. Not needed: Pro ($25 a month) only if the
   dashboard's database CPU stays high during the spike.
7. **GitHub Pages:** static files, 100 GB a month soft limit; make/ and its scripts are well under 1 MB. Fine.

## Worth paying for on launch day

- **Yes: Workers Paid, $5 a month.** Without it the Worker stops for the rest of the day after ~100,000 requests,
  which a front-page post reaches in hours. Cloudflare dashboard → Workers & Pages → Plans → Workers Paid. Nothing in
  the code changes.
- **Maybe: Serper credits, about $50**, if real spines (rather than ones made from the cover) for most titles matter
  on the day. Raise the caps and deploy after buying.
- **No:** Supabase Pro, SerpApi or Brave plans.
