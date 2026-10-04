// A title's page (/t/): /t/?film=<TMDB id> or /t/?book=<Open Library work id>, or a log's or a spine's kind, title and
// year (the page finds the id). The cover (worn when you've logged it), what it is (the Worker's /title), how people
// rated it (the average in spines, a histogram of the ten halves, watched by N · M friends), the panel (Log, Put on
// shelf, Add to Up next, Recommend, Share, or how each stands), On shelves (people you follow first, 12 faces), and the
// reviews: Friends · Popular · Recent, with Your review at the top until you've logged it.
const { test, expect } = require('@playwright/test');
const { ME, LOGS, SB_URL, CORS, TITLE_INFO, mockNetwork, watchErrors, open } = require('../site');

const panel = page => page.getByRole('group', { name: 'What to do with it' });
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);

test('a film by its TMDB id: what it is, how it was rated, who watched it, the panel', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await expect(page).toHaveTitle('Gummo (1997) · shelfstackd');
  await expect(page.locator('#tBy')).toHaveText('Directed by Harmony Korine · 89 min');
  await expect(page.locator('#tGenres')).toHaveText('Drama');
  await expect(page.locator('#tAbout')).toHaveText(TITLE_INFO[0].overview);
  await expect(page.locator('#tSpine')).toBeHidden();   // none in the archive
  // not logged by you: the cover is clean, with the 1px outline
  const cover = page.locator('#tCover img.clean');
  await expect(cover).toHaveAttribute('alt', 'The cover of Gummo (1997)');
  await expect(page.locator('#tCover canvas.worn')).toHaveCount(0);
  // @mira gave it 4.5 spines; the histogram has ten halves, the ninth filled; you follow her
  await expect(page.locator('#tAvg [role=img]')).toHaveAttribute('aria-label', '4.5 of 5');
  await expect(page.locator('#tAvg .grey')).toHaveText('4.5 of 5 · 1 rating');
  await expect(page.locator('#tHist li')).toHaveCount(10);
  expect(await page.locator('#tHist li').evaluateAll(ls => ls.map(l => l.dataset.n))).toEqual(['0', '0', '0', '0', '0', '0', '0', '0', '1', '0']);
  await expect(page.locator('#tWho')).toHaveText('watched by 1 · 1 friend');
  // the panel: Log first and solid; your shelf has it already; Up next; Share
  const p = panel(page);
  await expect(p.locator(':scope > *')).toHaveText(['Log', 'On your shelf', 'Add to Up next', 'Share']);
  expect(await p.getByRole('button', { name: 'Log' }).evaluate(b => getComputedStyle(b).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await p.locator('.state').evaluate(s => getComputedStyle(s).color)).toBe('rgb(107, 107, 107)');
  expect(errors).toEqual([]);
});

test('the panel: Log opens + ADD\'s Log it on this title; Add to Up next puts it on; Share has the link and WhatsApp', async ({ page, context }) => {
  test.skip(test.info().project.name.startsWith('phone'), 'the clipboard is tried at the desktop width');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const p = panel(page);
  await p.getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('#addDialog #addPostTitle')).toHaveText('Gummo (1997)');
  await page.locator('#addClose').click();
  const req = sent(page, 'POST', 'watchlist');
  await p.getByRole('button', { name: 'Add to Up next' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg' });
  await expect(p.locator('.state').filter({ hasText: 'In Up next' })).toBeVisible();
  await p.getByRole('button', { name: 'Share' }).click();
  await expect(p.getByRole('menuitem')).toHaveText(['Copy link', 'Share to WhatsApp']);
  await p.getByRole('menuitem', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/t\/\?film=106$/);
});

test('a link from a log (kind, title, year) takes the id\'s address; with no Worker it goes on with what the link says', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?kind=movie&title=gummo&year=1997');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await expect(page).toHaveURL(/\/t\/\?film=106$/);
  // a title the Worker doesn't know (or no Worker at all): the link's own words, and what people here did with it
  await open(page, '/t/?kind=book&title=Orlando&year=1928');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orlando 1928');
  await expect(page).toHaveURL(/kind=book&title=Orlando&year=1928$/);
  await expect(page.locator('#tBy')).toBeHidden();
  // no title at all
  await open(page, '/t/');
  await expect(page.locator('#state')).toHaveText('Which film or book? This link doesn’t say.');
});

test('a book: by and pages, its real spine from the archive; a title you logged has its cover worn and says when', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?book=OL99W');
  await expect(page.locator('#tBy')).toHaveText('by Virginia Woolf · 297 pages');
  await expect(page.locator('#tSpine img')).toHaveAttribute('src', /\/archive\/img\?id=0123456789abcdef0123456789abcdef$/);
  await expect(page.locator('#tSpine img')).toHaveAttribute('alt', 'The spine of The Waves (1931)');
  await expect(page.locator('#tWho')).toHaveText('read by 1 · 1 friend');
  // Just Kids: you read it
  await open(page, '/t/?book=OL5W');
  await expect(page.locator('#tCover canvas.worn')).toHaveCount(1);
  const mine = LOGS.find(l => l.owner === ME.id && l.title === 'Just Kids');
  const read = panel(page).locator('.state').first();
  await expect(read).toHaveText(/^Logged (\w+ \d+|\d+ \w+)$/);   // "Logged Sep 27", in the reader's own way of writing a date
  await expect(read.locator('a')).toHaveAttribute('href', `../p/?${mine.id}`);
  await expect(panel(page).getByRole('button', { name: 'Log' })).toHaveCount(0);
  await expect(page.locator('#yours')).toBeHidden();   // you've logged it: no Your review
  expect(errors).toEqual([]);
});

test('On shelves: the people whose shelves have it, people you follow first, each to that shelf; not you', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const faces = page.locator('#onList a');
  await expect(page.locator('#onH')).toHaveText(/^On shelves \(\d+\)$/);
  await expect(faces.first()).toHaveAttribute('aria-label', /^@mira: /);   // you follow @mira
  await expect(faces.first()).toHaveAttribute('href', /^\.\.\/u\/\?mira&shelf=/);
  expect(await faces.evaluateAll(as => as.some(a => a.getAttribute('aria-label').startsWith('@tester')))).toBe(false);
  expect(await faces.count()).toBeLessThanOrEqual(12);
});

test('reviews: Friends · Popular · Recent; each a post, a press to its page', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const tabs = page.getByRole('tablist', { name: 'Reviews' }).getByRole('tab');
  await expect(tabs).toHaveText(['Friends', 'Popular', 'Recent']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');   // someone you follow reviewed it
  const post = page.locator('#revList .post');
  await expect(post).toHaveCount(1);
  await expect(post.locator('.pwho span')).toHaveText('@mira');
  await expect(post.locator('.say')).toHaveText(/^The bathtub scene/);
  await expect(post.locator('.prating [role=img]')).toHaveAttribute('aria-label', '4.5 of 5');
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(post).toHaveCount(1);
  await post.locator('.say').click();
  await expect(page).toHaveURL(new RegExp(`/p/\\?${LOGS[0].id}$`));
  expect(errors).toEqual([]);
});

test('signed out: no Friends tab, no Your review; the panel signs you in first', async ({ page }) => {
  await mockNetwork(page, { social: true });
  await open(page, '/t/?film=106');
  await expect(page.getByRole('tab', { name: 'Friends' })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Popular' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#yours')).toBeHidden();
  await expect(page.locator('#tWho')).toHaveText('watched by 1');
  await panel(page).getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});

test('Your review: one press on the spines rates it, then the review and Post show; Post logs it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const yours = page.locator('#yours');
  await expect(yours).toBeVisible();
  await expect(yours.getByRole('button', { name: 'Post' })).toBeHidden();
  await expect(yours.getByRole('textbox')).toBeHidden();
  const spines = yours.getByRole('slider', { name: 'Rating' });
  await spines.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(spines).toHaveAttribute('aria-valuenow', '8');
  await expect(yours.getByRole('button', { name: 'Post' })).toBeVisible();
  await yours.getByRole('textbox', { name: /Review/ }).fill('Odd and tender.');
  const req = sent(page, 'POST', 'logs');
  await yours.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', year: 1997, rating: 8, review: 'Odd and tender.' });
});
