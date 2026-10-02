# Design review, 2 October 2026

For the 4:30 review. **Nothing in this list has been changed.** Each item has a picture, what's wrong (measured where
it can be), and a suggested fix to agree or throw out. The fixes are small unless they say otherwise.

The pictures are in `docs/review/`, made with the tests' made-up accounts and shelves (`tests/site.js`), the real
fonts, and the clock at 30 September 2026, 14:00 UTC; phone pictures are a 390px-wide window. `npm run shots` (in
`tests/`) makes full pages of everything in `tests/shots/`, which isn't committed.

## The ones you asked about

### 1. A shelf's page shows the story, not the shelf

`docs/review/shelf-page-390.png`, `docs/review/shelf-page-1280.png`

The page shows the whole 9:16 story picture: on a phone it's 358 × 623px, starts 290px down and runs off the bottom
of the screen. Most of it is the story's empty background, the spines sit at its foot, and the shelf's name is said
twice, once as the page's title and once as the caption written into the picture.

**Suggested fix:** show the shelf the way the profile's hero does (the spines cut out of the picture, on the grey
panel, no caption), and keep the 9:16 story for Share → Instagram story only, where that shape is the point. On a
phone the spines are then on the first screen, under the name. On a wide window the "On this shelf" list stays to the
right. The profile already has the drawing (`cards.js` finds the books in the picture), so this is mostly the shelf
page using it.

### 2. A log's cover on the feed is too big on a phone

`docs/review/feed-log-390.png`

The cover is 150 × 225px, the same as a shelf card, and on a 390px phone there's no room for the caption beside it,
so it wraps underneath. With its line and caption one log is about 300px of an 844px screen, most of it poster. Letterboxd's activity shows a
small poster (about 70px wide) with the line and the review beside it.

**Suggested fix:** a log's cover at 72 × 108px with the caption beside it, on every width; a shelf saved keeps its
card. The dog-ear and the wear are drawn for any size (`wear.js` takes the width), so only the feed's CSS changes,
plus the feed spec's sizes. The profile's Watchlist already uses this layout (`docs/review/profile-390.png`), so the
two would match.

### 3. The wear can't be seen on a log from today

`docs/review/wear-by-age.png` (top row a dark poster, bottom row a light one, at today, a week, a month, six months)

On the day it's logged a cover is faded 0.03 and worn 0.08 (out of 1): the scratches are there but too faint to see,
so only the dog-ear says anything. On a light poster the dog-ear barely shows at any age: the folded corner is drawn
cream and the cut-away corner shows the page's white, so cream meets cream meets white.

**Suggested fix:** start the wear higher (about 0.25 on the day, so two or three fine scratches show), and give the
fold a hairline edge and a soft shadow under it, so it reads on a white poster on a white page. The rule that it ages
(more faded after a week, more worn after a month) and is the same every time for the same log stays as it is; the
numbers in `specs/wear.spec.js` would move.

### 4. The bar still says SHELVES

`docs/review/header-390.png`, `docs/review/header-1280.png`

With one shelf each, the page is everyone's shelf, newest first, so the word still describes it. BROWSE would be
vaguer, and suggests browsing films and books, which the site doesn't have.

**Suggested fix:** keep SHELVES until there's more to browse (titles, lists), then rename. If it changes now, PEOPLE'S
SHELVES is too long for the phone row; BROWSE fits. It's one word in `nav.js` and a test either way.

### 5. The Add dialog's title, and the gap under All · Films · Books

`docs/review/add-log-390.png`, `docs/review/add-log-picked-390.png`

The title "Log a film or a book…" ends in an ellipsis, so it reads as cut off even when it isn't. Measured, it fits
on one line at 320, 360 and 390px wide (202px of text in a 254px line at 320px), and a longer one would wrap rather
than be cut, so what looks cut is the ellipsis itself. The gap: under All · Films · Books
there's an empty status line held open (20px tall plus 12px above it) so "Searching…" doesn't push the results down
when it appears; with nothing in it, it's 32px of nothing.

**Suggested fix:** drop the ellipses from the three titles ("Add to your shelf", "Log a film or book", "Add to your
watchlist"); put "Searching…" and the search's messages on the All · Films · Books row, right-aligned, so
nothing needs holding open and nothing jumps.

## Other things that look made from a template

### 6. The signed-out home is the standard landing page

`docs/review/home-signed-out-390.png`

A centred headline, a grey line under it, an outlined button, then a grid. It's the one screen that's centred; the
rest of the site is left-aligned.

**Suggested fix:** left-align it like everything else, lead with a real shelf (the picture, large) rather than
words, and make MAKE A SHELF the solid black button the bar's + uses. Letterboxd's signed-out home says what you do in
one line over a picture and has one bright button.

### 7. The footer on every page is a landing-page footer

`docs/review/footer-390.png`

How it works (four numbered steps), Sources, and "Shelf: Build it, then post it. OPEN SHELF", in black, at the foot of
profiles, Settings and the feed too. On a phone it's 635px tall.

**Suggested fix:** one or two lines on every page: the TMDB line (it has to stay), Open Library, Privacy,
hello@shelfstackd.com. How it works goes on the home page or a short About page.

### 8. The counts strip on a profile

`docs/review/profile-390.png`

2 SPINES | 1 FOLLOWING | 2 FOLLOWERS, in a full-width band with rules above, below and between, on a phone. It's the
stock "stats bar". On a wide window they're already small and to the right, which looks right.

**Suggested fix:** on a phone, one small line under @name ("2 spines · 1 following · 2 followers", each a link), like
Letterboxd's app.

### 9. Ellipses in the copy

"Add to your shelf…", "Here's what people you follow have been shelving…" (`docs/review/home-cards-390.png`), "find a
film or book…", and the Add dialog's placeholder "Gummo, The Waves, Kids..." with three full stops instead. Letterboxd uses one on its home line, and that's where it works; on dialog titles and placeholders it
reads as text that didn't fit.

**Suggested fix:** keep it on the home line, drop it everywhere else (with 5).

### 10. The bar's places change order when you sign in

`docs/review/header-signed-out-390.png`, `docs/review/header-390.png`

Signed out: SHELVES · MEMBERS · ⚡, no search. Signed in: ⚡ · SHELVES · MEMBERS · search. The same places move when
the state changes.

**Suggested fix:** one order for both, ⚡ · SHELVES · MEMBERS · search, with search signed out too (Members works
signed out).

### 11. The logo is hard to press on a phone

`docs/review/header-390.png`

Every control now takes a 44 × 44px press on a phone except the logo: its row is 32px above the places' row, so the
two press areas would overlap. A press just under SHELFSTACKD lands on SHELVES or ⚡.

**Suggested fix:** 12px more between the bar's two rows on a phone (the bar goes from 81 to 93px tall). The other way
is to make home the ⚡ and the logo not a link, which nobody expects.

### 12. Two names for one shelf in the builder

`docs/review/builder-name-caption-1280.png`

The bar at the bottom has Name ("a much longer shelf name…"), and Style has Caption ("my next reads."), which is
what the story shows. The page calls the shelf by its Name, the picture by its Caption.

**Suggested fix:** one name, used for both: the caption already follows the Name until you type your own, so
Caption can go from Style. If a separate caption is wanted, call it "Story caption" and keep it in Share.

### 13. Dashed links do too many jobs

Everywhere (`docs/review/shelf-page-390.png` has three): ← @MIRA (going back), REPORT (a complaint), EDIT, CHANGE,
CANCEL, CLEAR (which empties the list, no confirm) and UPLOAD A SCAN all look the same: bold capitals with a dashed underline.
Going somewhere, changing something and losing something can't be told apart.

**Suggested fix:** plain grey text for going back (← @mira, no capitals), dashed for small actions, and the ones that
lose something (Clear, Delete) in grey, Clear asking first as Delete already does.
