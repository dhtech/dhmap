// Browser tier configuration.
//
// Runs the real development server plus the fake monitoring backend, so the
// whole chain - page, /analytics redirect, backend - is exercised rather than
// stubbed at the network layer.
const { defineConfig, devices } = require('@playwright/test');

const APP_PORT = 8000;
const BACKEND_PORT = 5000;

module.exports = defineConfig({
  testDir: './test/e2e',
  // Always render the example, never whatever ipplan database happens to be
  // sitting in local/ - these assertions name specific switches.
  globalSetup: require.resolve('./test/e2e/global-setup.js'),
  fullyParallel: false,       // both specs share one fake backend
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command: `python3 test/fake/backend.py --port ${BACKEND_PORT}`
             + ' --scenario degraded',
      url: `http://127.0.0.1:${BACKEND_PORT}/-/healthy`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
    {
      command: `python3 localserver.py --port ${APP_PORT}`
             + ` --analytics-port ${BACKEND_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/dhmon.html`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
  ],
});
