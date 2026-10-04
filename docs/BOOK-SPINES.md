# Book spines: why they don't work

Written on 4 October 2026, before any code was changed for it. Live data: 4 people made shelves, all films, no books.
This is what the scan flow does today for six well-known books, run against the live Worker
(`https://api.shelfstackd.com`), with the page's own spine cutter (`findSpine` and `findSoloSpine` from `add.js`, run
as they are in a headless Chromium) on every scan `/scans` gave.

## The daily caps are not the cause

`/admin/usage` on 4 October (from the owner): Serper 0 of 100 today (102 of 2,400 credits in all), SerpApi 0 of 8,
Brave 0 of 30. Nothing was out for the day, and no `/scans` answer below says `capped`.

## What was run

1. `/identify?want=book&q=<title>` for each title, to get the title, year and author the dialog would send on.
2. `/scans?kind=book&…&round=0..3&cacheonly=1`: what the Worker already keeps (no search spent).
3. For the two titles with nothing kept (Nineteen Eighty-Four and The Great Gatsby), `/scans` for rounds 0 to 3 for
   real: 8 Serper searches (16 credits).
4. Every scan in those answers fetched through `/img`, and cut by `add.js`'s code with a note at each place it gives
   up, then the dialog's last filter (`bestCuts`: a book cut needs a score of 20 and a spine no wider than 1:5).

## Per provider

| | Serper | SerpApi | Brave |
|---|---|---|---|
| The Bell Jar, Animal Farm, Norwegian Wood, Just Kids | all four rounds were already kept (`raw1:` in KV), so nobody was asked. Which provider found them first isn't kept with them | not asked | not asked |
| Nineteen Eighty-Four | answered all four rounds (10, 10, 10 and 4 scans that pass the Worker's filter) | not asked | not asked |
| The Great Gatsby | answered all four rounds (10 each) | not asked | not asked |

SerpApi and Brave were never reached for a book. The chain stops at the first provider whose answer has one scan the
**Worker's** filter (`pick()`) keeps, and that filter only asks for the right shape (a wrap 1.2 to 2.4 wide, or a single
spine) and the title in the picture's name. Almost every book search has a photo of the book that passes it, so
Serper always "succeeds", and the page then throws out all of it. The provider order isn't the problem; what is
searched for, and what the page accepts, is.

What a provider says before any filtering can only be seen with `/admin/raw`, which needs the admin token (no
session has it). To compare the three on one title (one search each, SerpApi's from the day's 8):

```
for p in serper serpapi brave; do curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://api.shelfstackd.com/admin/raw?provider=$p&q=%22The+Bell+Jar%22+Sylvia+Plath+book+spine" > raw-$p.json; done
```

## Per title

Rounds today: 0 `"<title>" <author> book cover spine`, 1 `"<title>" <author> book spine`, 2 `"<title>" spine`,
3 `<title> <author> full cover wrap`. The dialog stops after two spines scoring 75 or more, or after round 3.

| Title (author /identify gave) | Scans (r0 / r1 / r2 / r3) | What the dialog offers | Why the rest were dropped |
|---|---|---|---|
| The Bell Jar (Sylvia Plath) | 2 / 3 / 6 / 5 | nothing real: Generated | no spine edges near the middle 9 (3D mock-ups and covers shot at an angle), flat-scan check 6 (uneven colour, not upright), a photo 1 |
| Animal Farm (George Orwell) | 10 / 10 / 10 / 10 | **a false spine**: jesskingblog.wordpress.com, score 67, from round 1 | a photo (plain border) 12, flat-scan check 19, no spine edges 5, not loadable 2 |
| Norwegian Wood (**MURAKAMI HARUKI**) | 4 / 4 / 7 / 5 | nothing real: Generated | a photo 6, no spine edges 5, flat-scan check 7, not loadable 2 (shutterstock) |
| Just Kids (Patti Smith) | 10 / 10 / 8 / 10 | a real spine: amazon.com, the Bloomsbury paperback's wrap, score 97, round 0 | a photo 11, flat-scan check 14, no spine edges 3, not an image 5 (instagram, facebook pages) |
| 1984: **not found by /identify**. As "Nineteen Eighty-Four" (George Orwell) | 10 / 10 / 10 / 4 | nothing real: Generated | a photo 10, no spine edges 8, flat-scan check 9, not loadable 5 (raptisrarebooks.com answers the proxy with an error) |
| The Great Gatsby (F. Scott Fitzgerald) | 10 / 10 / 10 / 10 | a real single spine: museumoutlets.com (106 x 496, the Scribner first edition's cloth spine), score 68, round 2 | a photo 15, not loadable 15 (raptisrarebooks.com), flat-scan check 7, one Penguin wrap cut too wide (140 x 554, over 1:5) |

"A photo": the scan's two side edges are one plain colour (a book on a table), so `findSpine` won't cut it.
"Flat-scan check": the strict test for books (a busy border, clear edges both sides of the spine, an even colour down
it, straight up and down), which a photo of a book always fails, and should. "No spine edges": nothing between 36 %
and 56 % of the width looks like a spine's edges (a front cover alone, a 3D mock-up).

### The false spine on Animal Farm

jesskingblog's picture (`gallery_animal_farm_cover_flat.jpg`, 700 x 500) is a student's flat design: a back cover and
a front cover side by side, **with no spine between them**. The cutter takes a 13 x 481px strip of plain red at the
join (x = 323) and scores it 67, which is enough to show. Measured down its length (12 equal parts, a row "lettered"
when 6 to 90 % of it differs clearly from the strip's own colour), it has lettering in 5 % of its rows and in 2 of the
12 parts, both at the ends. The real spines found: Just Kids 35 % of rows and 9 parts, Gatsby 17 % and 5 parts.

## So, why no books

1. **What's searched for finds photos, not scans.** For a book, image search mostly finds listings and blog photos
   of the book on a table. The page is right to refuse to cut a spine out of those, so most books end on Generated.
2. **The Worker's filter lets the photos through, so the chain never moves on.** Serper's answer always has one
   that passes `pick()`, so SerpApi and Brave are never asked, and the later rounds ask much the same question.
3. **One false spine gets through.** A plain strip at the join of a two-panel design scores 67 (Animal Farm).
4. **Two lookups go wrong before any search.** "1984" doesn't find Orwell (Open Library's title is Nineteen
   Eighty-Four, and the Worker keeps a book only when what was typed is in its title or author). Norwegian Wood's
   author comes back as "MURAKAMI HARUKI": Open Library gives 村上春樹, and the first Latin-script alternative is the
   all-capitals one.
5. **No way forward when there's no real spine.** The dialog says "No real spine found." and offers Generated; a book
   someone owns could be photographed, and the upload that would take it is on the builder only.

Also seen: 30 of the 188 scans couldn’t be loaded at all (raptisrarebooks.com and shutterstock
answer the proxy with 502; instagram and facebook links are pages, not pictures, 415). Each takes one of the ten
places in a round. Not changed here.

## What changes (Phase 1)

- Books: when round 0 finds no clean spine, search `"<title>" <author> book spine`, then
  `"<title>" <author> dust jacket full wrap`, one paid search each, only while there's still nothing. No more rounds
  after that for a book.
- A single-spine image (1:6 or narrower, with lettering) is the whole spine.
- A book's spine must show lettering along its length (the measure above: at least 10 % of its rows, in at least 3
  of 12 parts), so the Animal Farm strip is dropped.
- No real spine: "Have it? Photograph the spine" first (the upload, from the dialog), Generated next.
- Authors in Latin letters as a person writes them: "Haruki Murakami".
- Title search, everywhere it's used: the title as typed first, then titles starting with it, then the rest. "gumm"
  today doesn't offer Gummo at all (the Worker keeps TMDB's first five before anything is ranked), and "1984" finds
  Nineteen Eighty-Four.

The diagnosis scripts are not in the repo (they spend searches); the numbers above are from 4 October 2026.
