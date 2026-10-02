# Option L: Letterboxd structure, archive skin (pictures only)

Home signed in and signed out, a profile, the feed and a shelf's page, at 1280px and 390px, with the tests' made-up
data and the clock at 30 September 2026, 14:00 UTC. Nothing on the site changed: the skin was put into each page as it
was shot. Layouts, shelf.js's drawing, the spines and wear.js are as they are.

- Fonts: Hanken Grotesk 400/500/700 for the UI; Newsreader 500/600 for film and book titles, shelf names and
  profile names. Both are SIL Open Font License 1.1 (Hanken Grotesk: The Hanken Grotesk Project Authors, 2021;
  Newsreader: The Newsreader Project Authors, 2020), so they can be self-hosted and used on the site; the licence file
  goes with the font files, and the fonts can't be sold on their own.
- Sizes: nav 13px 700 caps, 1px tracking; section labels 13px caps; body 16px; small metadata 12px.
- Colours on #F5F2EA (with a static grain of about 3%): body #5E574D (6.4:1), important #1C1915 (15.7:1), rust
  #99491D for watched / read / shelved and dates (5.7:1). Faded yellow #EDE37A only on + ADD (yellow on #1C1915,
  13.2:1), ::selection and the "today" tab (#1C1915 on yellow).
- Metadata: #8C857A was asked for, but it is 3.3:1 on this paper, under AA's 4.5:1 for small text. These pictures use
  #6F685D, the same hue darker: 4.9:1 on the paper, 4.6:1 where the grain darkens it.
- axe's colour-contrast check ran on every page shot here, at both widths: no failures.
- Also: "No. 001" before each title in a shelf's list, "archive since Aug 2026" on a profile (from when the account was
  made), and an underline on hover.
