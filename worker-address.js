/* The Worker's address. Pages call window.SPINESTACK_WORKER (https://api.shelfstackd.com). Some networks, like college
   and office Wi-Fi that block new domains, cut that connection off. So a request to it that fails with a network error
   (never a 4xx or 5xx answer) is sent again to the same Worker at window.SPINESTACK_WORKER_FALLBACK (its workers.dev
   address), and once that answers, the tab uses it for the rest of the session. Nothing is checked in advance.
   Load it after the page's settings and shelf.js, before the page's own script. */
(() => {
  const strip = s => String(s || '').trim().replace(/\/+$/, '');
  const MAIN = strip(window.SPINESTACK_WORKER), SPARE = strip(window.SPINESTACK_WORKER_FALLBACK), KEY = 'shelfstackd-worker';
  if (!MAIN || !SPARE || MAIN === SPARE) return;
  let spare = false;
  try { spare = sessionStorage.getItem(KEY) === SPARE; } catch {}
  if (spare) window.SPINESTACK_WORKER = SPARE;   // the page builds every Worker address from this
  // the main address has answered on this page, so this network doesn't block it: a failure now is something else
  let mainOk = false;
  const onMain = u => typeof u === 'string' && (u.startsWith(MAIN + '/') || u.startsWith(MAIN + '?'));
  const toSpare = u => SPARE + u.slice(MAIN.length);
  const useSpare = () => {
    if (spare) return;
    spare = true; try { sessionStorage.setItem(KEY, SPARE); } catch {}
    for (const im of document.images) if (onMain(im.src) && !im.complete) im.src = toSpare(im.src);   // not loaded yet (lazy ones too)
  };

  const fetch0 = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
    if (!onMain(url)) return fetch0(input, init);
    if (spare) return fetch0(toSpare(url), init);
    try { const r = await fetch0(url, init); mainOk = true; return r; }
    catch (e){
      if (!(e instanceof TypeError) || mainOk) throw e;   // an abort, or a dropped connection on a network that reaches it
      const r = await fetch0(toSpare(url), init);   // if this fails too, it's the connection: nothing is remembered
      useSpare(); return r;
    }
  };

  // images can't tell a blocked connection from a 404, so one is tried again only while the main address hasn't answered
  if (window.Shelf && Shelf.loadImg){
    const load = Shelf.loadImg;
    Shelf.loadImg = src => {
      if (!onMain(src)) return load(src);
      if (spare) return load(toSpare(src));
      return load(src).then(im => { mainOk = true; return im; },
        err => { if (mainOk && !spare) throw err; return load(toSpare(src)).then(im => { useSpare(); return im; }); });
    };
  }
  // on the document: an image's load event never reaches window
  document.addEventListener('error', e => {
    const im = e.target;
    if (im instanceof HTMLImageElement && onMain(im.src) && (spare || !mainOk)) im.src = toSpare(im.src);
  }, true);
  document.addEventListener('load', e => {
    const im = e.target;
    if (!(im instanceof HTMLImageElement)) return;
    if (onMain(im.src)) mainOk = true;
    else if (im.src.startsWith(SPARE + '/')) useSpare();
  }, true);
})();
