# Found, not fixed

From the launch pass on 2 October 2026: every page as a brand-new account, signed out and signed in, on a 390px phone
and at 1280px, with the database out of reach, and before 0007. What was fixed is in the commits on `letterboxd-flow`
from that day. This is what was left, and why. Since then the design review was applied (the same day): 3, 5 and 6
below are fixed, and 8 was confirmed on the laptop.

1. **A shared profile or shelf link previews as "Profile · shelfstackd"** with the site's picture, not the person's
   name and their shelf. WhatsApp reads a page without running its JavaScript, and the pages are static, so it can't
   know who `/u/?mira` is. The fix is in the Worker: answer `/u/` for link-preview bots (WhatsApp, iMessage, Slack, X)
   with the person's name, their shelf's name and its picture as `og:` tags over the static page. That needs a Worker
   change and a deploy, which a session doesn't do. Worth doing soon after launch: these are the links people share.
2. **Gone** (0007 was run on 2 October): before it, the feed and profiles asked for logs, the watchlist and From
   friends, got 404s, and the browser wrote "Failed to load resource: 404" in the console.
3. **Fixed** (design review 11): the logo was the one control on a phone without a 44px press area. The bar's two
   rows are 12px further apart now, and `specs/taps.spec.js` checks the logo like everything else.
4. **Links inside a sentence** (Privacy in a note, @names and shelf names in a feed line) are a line tall, not 44px.
   That's the usual exception for text links; `specs/taps.spec.js` leaves them out.
5. **Fixed** (design review 10): signed out, the bar had no search. It has, in the same place as signed in.
6. **Fixed** (design review 13): Clear on the builder emptied the list without asking. It asks first now, as Delete
   does.
7. **The not-found page has no share tags.** Nobody shares it.
8. **4 checks in `specs/requests.spec.js` fail in the cloud container**, before and after this work: its Chromium (1194)
   is older than the one Playwright 1.63 wants (1243) and reports the icons' requests differently. They pass on a
   normal machine; it isn't the site. (Confirmed on the laptop on 2 October: all of `requests.spec.js` passes there.)
