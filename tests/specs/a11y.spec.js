// axe on every page: nothing it rates serious or critical.
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { PAGES, OTHER_PAGES, mockNetwork, open } = require('../site');

const runs = [
  ...PAGES.map(p => ({ ...p, signedIn: false })),
  ...PAGES.map(p => ({ ...p, signedIn: true })),
  { name: 'own profile', path: '/u/?tester', signedIn: true },
  ...OTHER_PAGES.map(p => ({ ...p, signedIn: false })),
];

for (const run of runs) {
  test(`axe: ${run.name}, ${run.signedIn ? 'signed in' : 'signed out'}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: run.signedIn });
    await open(page, run.path);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.impact} ${v.id}: ${v.help}\n` + v.nodes.map(n => `    ${n.target.join(' ')}  ${n.failureSummary.replace(/\s+/g, ' ')}`).join('\n'));
    expect(bad, bad.join('\n')).toEqual([]);
  });
}
