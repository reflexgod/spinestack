# Found, not fixed

From the launch pass on 2 October 2026: every page as a brand-new account, signed out and signed in, on a 390px phone
and at 1280px, with the database out of reach, and before 0007. What was fixed is in the commits on `letterboxd-flow`
from that day. This is what was left, and why.

1. **A shared profile or shelf link previews as "Profile · shelfstackd"** with the site's picture, not the person's
   name and their shelf. WhatsApp reads a page without running its JavaScript, and the pages are static, so it can't
   know who `/u/?mira` is. The fix is in the Worker: answer `/u/` for link-preview bots (WhatsApp, iMessage, Slack, X)
   with the person's name, their shelf's name and its picture as `og:` tags over the static page. That needs a Worker
   change and a deploy, which a session doesn't do. Worth doing soon after launch: these are the links people share.
2. **Before 0007 is run**, the feed and profiles ask for logs, the watchlist and From friends, get 404s, and the
   browser writes "Failed to load resource: 404" in the console. The pages carry on with shelves only. It goes when
   0007 is run, which `docs/LAUNCH.md` does before the merge.
3. **The logo is the one control on a phone without a 44px press area**: its row is 32px above the places' row, so a
   press just under SHELFSTACKD can land on SHELVES. It needs 12px more bar, a design call (`docs/DESIGN-REVIEW.md`,
   11).
4. **Links inside a sentence** (Privacy in a note, @names and shelf names in a feed line) are a line tall, not 44px.
   That's the usual exception for text links; `specs/taps.spec.js` leaves them out.
5. **Signed out, the bar has no search**, though Members works signed out (`docs/DESIGN-REVIEW.md`, 10).
6. **Clear on the builder empties the list without asking.** Nothing is saved until Save, so the shelf on your
   profile is safe, but the list is gone (`docs/DESIGN-REVIEW.md`, 13).
7. **The not-found page has no share tags.** Nobody shares it.
8. **4 checks in `specs/requests.spec.js` fail in the cloud container**, before and after this work: its Chromium (1194)
   is older than the one Playwright 1.63 wants (1243) and reports the icons' requests differently. They pass on a
   normal machine; it isn't the site.
