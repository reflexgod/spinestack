/* The site as GitHub Pages serves it, for the tests: plain files from the repo root, index.html for a folder, and
   404.html (with the status 404) for anything that isn't there.
   node serve.js [port] (8181 unless given). */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.argv[2] || 8181;
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.md':'text/plain; charset=utf-8'};

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)){ res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()){
      if (!rel.endsWith('/')){ res.writeHead(301, {Location: rel + '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')}).end(); return; }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (e, data) => {
      if (e){   // not there: the site's own page for that, as GitHub Pages sends it
        fs.readFile(path.join(ROOT, '404.html'), (e2, lost) => res.writeHead(404, {'Content-Type': e2 ? 'text/plain' : TYPES['.html'], 'Cache-Control':'no-store'}).end(e2 ? 'Not found' : lost));
        return;
      }
      res.writeHead(200, {'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store'}).end(data);
    });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`shelfstackd on http://127.0.0.1:${PORT}/`));
