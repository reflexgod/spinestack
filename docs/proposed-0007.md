# 0007: logs, the watchlist and From friends

Written on 2 October 2026 as a proposal for the owner to review (this file keeps the name it had then). **The owner ran
it on the live database the same day, as it was written**, and its SQL and test are where migrations live. The pages on
`letterboxd-flow` ask for what it adds, and do without it on a database that hasn't got it.

- `supabase/migrations/0007_logs_watchlist.sql`: the SQL. Read its header first: who sees what, and what changes.
- `supabase/tests/rls_phase4.sql`: its test, written like `supabase/tests/rls_phase3.sql` (throwaway users in a
  transaction, rolled back, "ALL PHASE 4 CHECKS PASSED" at the end).

## How it was checked

On a local Postgres 16 in the cloud session: a stand-in for what Supabase has before any migration (the `auth` schema
with `auth.users` and `auth.uid()` reading `request.jwt.claims`, the `anon` and `authenticated` roles), then `0001`,
`0002`, `0004`, `0005`, `0006` and the proposed `0007`, all without an error. Then `rls_phase3.sql` (all phase 3 checks
passed, so `0007` changes nothing they cover) and `rls_phase4.sql` (all phase 4 checks passed). Then on Supabase
itself, on 2 October, following `docs/RUN-0007.md`: both tests passed there too.

The first version of `activity()` and `from_friends()` read `profiles.hidden`, which `anon` and `authenticated` aren't
granted (`0002` grants only some of the profile's columns). The test found it; they now leave hidden profiles out
through `profile_is_public()` and `approved_follower_of()`, as `feed()` does.

## Hardening after the first review

- **Two adds at once can't beat a limit.** The logs and watchlist triggers take a lock for that person
  (`pg_advisory_xact_lock(hashtext('logs:' || owner))`, and `'watch:'`) before they count. Checked locally with two
  sessions adding at the same moment, one holding its transaction open: without the lock the watchlist ended at 7 and
  the logs at 51; with it, 6 and 50, the second add getting the limit's message. The SQL Editor has one session, so
  `rls_phase4.sql` checks that an add takes the lock.
- **50 logs a day counts what was posted, not what's left.** `log_counts (owner, day, n)` is added to in the logs
  trigger (an upsert, under the same lock), so deleting a log and posting it again can't fill the feed. The day is UTC.
  Nothing is granted on it and it has no policies: only the trigger, which runs as the table's owner, touches it, and it
  lets a person's days before yesterday go as they post.
- **From friends keeps 500 removals a person at most.** The friend_hides trigger takes a lock for the person
  (`'hides:'`), lets removals older than 180 days go, then refuses the 501st with "That's 500 titles removed from From
  friends, the most it keeps." The profile shows that as its message. (Letting the oldest go instead of refusing is a
  one-line change, if that's preferred.)
- **Unfollowing someone takes their name off what you kept from them.** A trigger on `follows` (after delete) clears
  `watchlist.from_user` for that pair; the titles stay on your watchlist.
- **A log hidden by moderation can't be deleted by its owner.** The logs delete policy is now `owner = auth.uid() and
  not hidden`, so it stays for us to look at. (The page's Delete then does nothing for a hidden log; the owner no longer
  sees it anywhere but their own Activity.)

## What the pages ask for

| Page | Asks | On a database without 0007 |
|---|---|---|
| `feed/` | `rpc/activity` with `{scope, before, before_id, n}` (20 at a time) | 404: asked once, then `rpc/feed` (shelves only) and, for YOU, the `shelves` table, as before |
| `u/`, Profile | `watchlist?owner=eq.<id>&order=created_at.desc&limit=6` | 404: no Watchlist section |
| `u/`, Profile (yours) | `rpc/from_friends` with `{n: 6}` | 404: no From friends section |
| `u/`, Activity | `logs?owner=eq.<id>&order=created_at.desc,id.desc&limit=20&offset=…` | 404: shelves only |
| `u/`, Keep | `POST watchlist` `{kind, title, author, year, cover_src, from_user}` | (no section to press it in) |
| `u/`, Remove (From friends) | `POST friend_hides` `{item_key}` | |
| `u/`, Remove (watchlist) | `DELETE watchlist?id=eq.<id>` | |
| `u/`, Delete (a log) | `DELETE logs?id=eq.<id>` | |
| `add.js`, Log it | `POST logs` `{kind, title, author, year, cover_src, caption}` | "Logging isn’t open yet. Try again soon." |
| `add.js`, Watchlist | `POST watchlist` `{kind, title, author, year, cover_src}` | "The watchlist isn’t open yet. Try again soon." |

`cover_src` is `url:` and a TMDB or Open Library address, or null, as a shelf's spine keeps it. A log's time on the
feed, and how worn its cover is, come from `logs.created_at`, which the database sets.

On a database without it, those 404s show in the browser's network panel and console on the feed and on profiles.
That's the browser reporting them; the pages carry on.

## What was decided, and what's still open

1. **It was run as it is:** a watchlist of 6 (a hard limit in the database, like a free shelf's 6 spines) that
   visitors can see, like a shelf; 50 logs a day (by the UTC day: it starts again at midnight UTC); 180 days for From
   friends. Changing any of these now is a new migration.
2. **`docs/RUN-0007.md`** has the steps that were followed, and a tested way to take it out again.
3. **One shelf each, in the database too (optional).** The pages show and save one shelf per person; the database
   still allows 200. The end of the SQL has the query that lists accounts with more than one, and the unique index that
   would make one a rule. It's commented out: it fails while anyone has two, so what happens to their other shelves
   has to be decided first.
4. **privacy.html** now says what logs and the watchlist keep and who sees them. Read it with the SQL.
