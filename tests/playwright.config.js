// Playwright: every check runs at a desktop width and a phone width, against the files in the repo (tests/serve.js).
const { defineConfig } = require('@playwright/test');
const PORT = 8181;

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
  use: { baseURL: `http://127.0.0.1:${PORT}`, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  ],
  webServer: { command: `node serve.js ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: true, timeout: 20000 },
});
