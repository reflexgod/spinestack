// Libraries the pages load: from the site itself (vendor/, copied from npm at an exact version: jsDelivr once took 8 s
// to send supabase-js, and saving failed while it did), each with an integrity hash that matches the copy in vendor/
// and, when that version is installed here, the one in tests/node_modules.
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ROOT } = require('../site');

const pages = [...fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f)),
  ...fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && !['tests', 'worker', 'backend', 'node_modules', 'vendor'].includes(d.name) && !d.name.startsWith('.'))
    .map(d => path.join(ROOT, d.name, 'index.html')).filter(f => fs.existsSync(f)),
  ...fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, f))];   // nav.js loads libraries too
const sha = file => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64');

test('libraries come from vendor/, pinned, with a matching integrity hash, and nothing from a CDN', () => {
  test.skip(test.info().project.name !== 'desktop-1280', 'reads files, no browser: once is enough');
  expect(pages.length).toBeGreaterThan(3);
  const seen = [];
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8'), rel = path.relative(ROOT, file);
    // scripts and stylesheets from anywhere else (Google Fonts stylesheets are the one exception)
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/g)) {
      if (/^<link\b/.test(m[0]) && !/rel="stylesheet"/.test(m[0])) continue;   // preconnect and the like
      expect(['fonts.googleapis.com'], `${rel}: ${m[1]}`).toContain(new URL(m[1]).hostname);
    }
    expect(html, `${rel} loads from jsDelivr`).not.toContain('cdn.jsdelivr.net');
    for (const line of html.split('\n').filter(l => l.includes('vendor/'))) {
      for (const m of line.matchAll(/vendor\/((?:@[^/]+\/)?[^/@'"]+)@([^/'"]+)\/([^'"\s]+)/g)) {
        const [url, pkg, version, inner] = m, sri = /sha384-[A-Za-z0-9+/=]+/.exec(line), own = path.join(ROOT, 'vendor', `${pkg}@${version}`, inner);
        expect(version, `${rel}: ${url} needs an exact version`).toMatch(/^\d+\.\d+\.\d+$/);
        expect(sri, `${rel}: ${url} needs an integrity hash on the same line`).not.toBeNull();
        expect(fs.existsSync(own), `${rel}: ${own} is there`).toBe(true);
        expect(sri[0], `${rel}: integrity of ${url}`).toBe(sha(own));
        seen.push(url);
        const dir = path.join(__dirname, '..', 'node_modules', pkg);
        if (fs.existsSync(path.join(dir, 'package.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version === version)
          expect(sri[0], `${rel}: ${url} is npm's file`).toBe(sha(path.join(dir, inner)));
      }
    }
  }
  expect(seen.length, 'the Supabase library at least').toBeGreaterThan(0);
});
