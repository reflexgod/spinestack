# Launch checklist (owner only)

Everything here changes what is live, so a session doesn't do any of it. Do it in this order: each step assumes the
ones before it. Commands are for Git Bash, from the repo's folder, on `letterboxd-flow` unless a step says otherwise.
Nothing below prints a key.

Before starting, read `docs/FOUND-NOT-FIXED.md` (what's known and left) and, if it's agreed, `docs/DESIGN-REVIEW.md`.

## 1. Run 0007 on the live database (done on 2 October 2026)

Nothing to do here. All seven steps of `docs/RUN-0007.md` are done:

1. The readiness query: all four `true`.
2. `0007` run in the SQL Editor.
3. `notify pgrst, 'reload schema';`
4. The check query: all six `true`.
5. `rls_phase4.sql`, then `rls_phase3.sql`: `ALL PHASE 4 CHECKS PASSED`, `ALL PHASE 3 CHECKS PASSED`.
6. The three `curl` checks as a visitor: the feed came back as a list, and `from_friends` and `log_counts` answered
   "permission denied".
7. The files are where migrations live: `supabase/migrations/0007_logs_watchlist.sql` and
   `supabase/tests/rls_phase4.sql`.

The live pages haven't changed: they're still `main`, which doesn't ask for logs. If 0007 ever has to come out again,
`docs/RUN-0007.md` step 8 has the SQL.

## 2. Publish the Google sign-in

While the Google app is in Testing, only its listed test users can sign in. [console.cloud.google.com](https://console.cloud.google.com)
→ the shelfstackd project → **Google Auth Platform**:

1. **Branding:** app name `shelfstackd`, your support email, home page `https://shelfstackd.com`, privacy policy
   `https://shelfstackd.com/privacy.html`, authorised domains `shelfstackd.com` and `supabase.co`. Leave the logo
   empty: adding one sends the app to Google's brand review, which takes days.
2. **Data Access:** only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Nothing else: those three
   need no review.
3. **Clients** → the Web client: Authorised redirect URI `https://fiukspnovrlzlcdekcnb.supabase.co/auth/v1/callback`.
4. **Audience** → **Publish app** → **Confirm**. Publishing status should say **In production**.

Check: in a private window, sign in on `https://shelfstackd.com/build/` with a Google account that was never a test
user. It should go through with no "Google hasn't verified this app" page. Google's screen will say "to continue to
fiukspnovrlzlcdekcnb.supabase.co": that's Supabase's address, and changing it needs Supabase's paid custom domain.

## 3. hello@shelfstackd.com (Cloudflare Email Routing)

Settings and `privacy.html` give hello@shelfstackd.com for deleting an account and for questions. Until this step,
mail to it bounces.

[dash.cloudflare.com](https://dash.cloudflare.com) → **shelfstackd.com** → **Email** → **Email Routing**:

1. **Get started** / **Enable**. It offers to add its MX and TXT records: **Add records and enable**. (If it says other
   MX records exist, stop and look: nothing else should be receiving mail for shelfstackd.com.)
2. **Destination addresses** → add the inbox you read → open the email Cloudflare sends there and verify.
3. **Routing rules** → **Create address**: custom address `hello`, action **Send to an email**, destination the
   address from 2. **Save**.

Check, in Git Bash:

```bash
nslookup -type=mx shelfstackd.com
```

It should list `route1.mx.cloudflare.net`, `route2...` and `route3...`. Then send a mail to hello@shelfstackd.com from
a different address: it should arrive in a minute or two. Email Routing only receives; a reply goes from your own
address unless you set up sending separately (it isn't needed for launch, and email sign-in stays off).

## 4. A spending limit on Brave

Brave's search API bills the card on file once the month's free credit (about 1,000 searches) is used, and has no cap
by itself. The Worker asks Brave at most 30 times a day (`BRAVE_DAILY_CAP` in `worker/wrangler.toml`, 930 a month at
most), but that doesn't protect the key if it ever leaked.

[api-dashboard.search.brave.com](https://api-dashboard.search.brave.com) → your subscription → set a monthly usage
(spending) limit, about $5 so it stays within the free credit, and a usage alert at 80%. Check the page shows the
limit saved.

## 5. The Worker: nothing to deploy

The live Worker already has the Serper fix (`3774d06`, Serper is asked without double quotes): it was deployed and
checked live on 2 October 2026, and nothing in `worker/` has changed since. So this launch has no Worker deploy. Only
check that's still true:

```bash
git checkout letterboxd-flow && git pull
git log --oneline 3774d06..HEAD -- worker/    # nothing printed: the live Worker is the newest
curl -s https://api.shelfstackd.com/health; echo
```

`/health` should answer `"ok":true` with `serper`, `serpapi` and `brave` all `true` under `scans`.

If `git log` does print a commit, the Worker has changed since 2 October and that change needs deploying first:
`cd worker && npm test` (all checks pass), then `npx wrangler deploy`, then `/health` again. If a deploy goes wrong,
`npx wrangler rollback` (in `worker/`) puts the previous version back.

## 6. Merge into main

`main` is what GitHub Pages serves at shelfstackd.com. First run both test suites on your machine:

```bash
git checkout letterboxd-flow && git pull
(cd worker && npm test)
(cd tests && npm run test:all)                # html-validate, then every page at 1280px and 390px
```

All should pass, `requests.spec.js` included (it fails only in the cloud container's older browser). Then:

```bash
git checkout main && git pull
git merge --no-ff letterboxd-flow -m "Merge letterboxd-flow: one shelf each, logs, the watchlist, From friends"
git push origin main
git checkout letterboxd-flow
```

(Or open a pull request from `letterboxd-flow` into `main` on GitHub and merge it there.)

GitHub → **Actions** shows "pages build and deployment"; it takes a minute or two. Then check the live home page has
this branch's files (the two lines should match) and the feed is there:

```bash
grep -o 'site.css?v=[0-9a-z]*' index.html | head -1
curl -s https://shelfstackd.com/ | grep -o 'site.css?v=[0-9a-z]*' | head -1
curl -s -o /dev/null -w '%{http_code}\n' https://shelfstackd.com/feed/  # 200
```

If it goes wrong: `git checkout main && git revert -m 1 HEAD && git push origin main` puts the site back as it was
(the database keeps 0007, which the old pages don't ask for).

## 7. Test it on your phone, live

On your phone's browser (not a private tab, so sign-in sticks), at https://shelfstackd.com:

1. **Signed out:** home loads, no sideways scroll. **+** → type "gummo" → pick it → spines appear. Close.
2. **Sign in with Google** with a second Google account (a new account, as a stranger would): it goes straight
   through, then asks for a username. Pick one, tick 18 or older, **Create account**.
3. **Your shelf:** add two titles, **Save**. Your profile shows it big at the top; the shelf's page lists both.
4. **Log it:** **+** → Log it → a film → a caption → **Post**. "Logged … It's on the feed." The feed's **You** shows
   "@you watched … · today" with the dog-eared cover.
5. **Watchlist:** **+** → Watchlist → a book → **Add to watchlist**. It's on your profile under Watchlist.
6. **Follow:** Members → find your main account → **Follow**. From the main account, log something; on the second
   account's profile it shows under From friends. **Keep** puts it on the watchlist; **Remove** takes it off.
7. **Share:** send your profile's link to yourself on WhatsApp. The preview shows shelfstackd's title and picture (a
   profile's own name isn't in it yet: `docs/FOUND-NOT-FIXED.md`, 1).
8. **No signal:** airplane mode, reload your profile: "Couldn't reach shelfstackd…", not a blank page. Airplane mode
   off.
9. **Mail:** from your phone's mail app, write to hello@shelfstackd.com: it arrives (step 3).
10. **Tidy up:** delete the test log (your profile → Activity → **Delete** beside it), sign out. Keep or delete the second account (deleting
    is by email, as Settings says).
