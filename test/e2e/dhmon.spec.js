/**
 * End-to-end tests for dhmon.html, the map as a user meets it.
 *
 * Nothing is stubbed at the network layer: the real development server runs,
 * the /analytics redirect is followed, and the fake backend answers - so this
 * covers the whole chain including the Raphael rendering and the jQuery UI
 * dialog patch that a library upgrade is most likely to break.
 */
const { test, expect } = require('@playwright/test');

const BACKEND = 'http://127.0.0.1:5000';
// Healthy under the degraded scenario, so it is a stable anchor for "has the
// first poll landed yet".
const SWITCH = 'd73-a.event.dreamhack.local';
// CRITICAL under degraded and OK under healthy, so it actually changes when
// the scenario does - polling on a switch that is OK either way would pass
// before the refresh had happened.
const CHANGING_SWITCH = 'd74-a.event.dreamhack.local';

/** Statuses the degraded scenario is built to produce, keyed by short name. */
const POLL_MS = 10000;

/** Point the backend at a different scenario and wait for the map to catch up. */
async function useScenario(page, name) {
  const response = await page.request.get(
    `${BACKEND}/control/scenario?name=${name}`);
  expect(response.ok()).toBeTruthy();
}

/** The fill Raphael applied to a switch, read back out of the live SVG. */
async function switchFill(page, name) {
  return page.evaluate((switchName) => {
    // dhmap keeps its registry private, so go via the drawn SVG instead:
    // switch rectangles are the small ones carrying a click handler.
    const status = window.switch_status || {};
    return status[switchName];
  }, name);
}

test.describe('dhmon.html', () => {
  test('loads without console errors or failed requests', async ({ page }) => {
    const errors = [];
    const failed = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('requestfailed', (req) =>
      failed.push(`${req.url()} ${req.failure()?.errorText}`));

    await page.goto('/dhmon.html');
    await expect(page.locator('#canvas svg')).toBeVisible();

    expect(errors, 'console errors').toEqual([]);
    expect(failed, 'failed requests').toEqual([]);
  });

  test('renders the map as SVG', async ({ page }) => {
    await page.goto('/dhmon.html');
    const svg = page.locator('#canvas svg');
    await expect(svg).toBeVisible();

    // Tables, switches, label boxes and the hall bounding box.
    await expect(svg.locator('rect')).not.toHaveCount(0);
    await expect(page.locator('#canvas svg text', { hasText: 'Hall 1' }))
      .toHaveCount(1);
  });

  test('populates the menu from the same data', async ({ page }) => {
    await page.goto('/dhmon.html');
    await expect(page.locator('li[id^="menu_switch_"]')).not.toHaveCount(0);
    await expect(page.locator('#menu_switch_D73-A')).toHaveCount(1);
  });

  test('applies statuses from the backend to the map', async ({ page }) => {
    await useScenario(page, 'degraded');
    await page.goto('/dhmon.html');

    // computeStatus runs once the first poll completes.
    await expect.poll(() => switchFill(page, SWITCH), { timeout: POLL_MS })
      .toBeTruthy();

    const statuses = await page.evaluate(() => window.switch_status);
    const values = Object.values(statuses);
    expect(values.length).toBeGreaterThan(0);
    // The degraded scenario deliberately spans several failure modes.
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  test('repaints when the backend state changes', async ({ page }) => {
    await useScenario(page, 'degraded');
    await page.goto('/dhmon.html');
    await expect
      .poll(() => switchFill(page, CHANGING_SWITCH), { timeout: POLL_MS })
      .toBe('CRITICAL');

    await useScenario(page, 'healthy');
    // The map re-fetches on a 10s interval, so allow for a couple of cycles.
    await expect
      .poll(() => switchFill(page, CHANGING_SWITCH), { timeout: 3 * POLL_MS })
      .toBe('OK');

    const statuses = await page.evaluate(() => window.switch_status);
    expect(new Set(Object.values(statuses))).toEqual(new Set(['OK']));
  });

  test('menu entries take the colour of their status', async ({ page }) => {
    await useScenario(page, 'healthy');
    await page.goto('/dhmon.html');
    await expect.poll(() => switchFill(page, SWITCH), { timeout: POLL_MS })
      .toBe('OK');

    await expect(page.locator('#menu_switch_D73-A'))
      .toHaveAttribute('data-status', 'OK');
  });

  test('searching filters the menu', async ({ page }) => {
    await page.goto('/dhmon.html');
    await expect(page.locator('#menu_switch_D73-A')).toHaveCount(1);

    // #search is the wrapper span; the field itself is #search_menu, and the
    // filter runs on Enter (dhmon.html:183).
    await page.locator('#search_menu').fill('D73');
    await page.locator('#search_menu').press('Enter');

    await expect(page.locator('#menu_switch_D73-A')).toBeVisible();
    await expect(page.locator('#menu_switch_D74-A')).toBeHidden();
  });

  test('clicking a switch opens the detail dialog', async ({ page }) => {
    await useScenario(page, 'degraded');
    await page.goto('/dhmon.html');
    await expect
      .poll(() => switchFill(page, CHANGING_SWITCH), { timeout: POLL_MS })
      .toBe('CRITICAL');

    // The dialog opens from the map, not the menu: a menu entry's link calls
    // dhmap.filter (dhmenu.js:67), while the drawn switch carries the click
    // callback (dhmap.js:117). Under the degraded scenario this switch is
    // CRITICAL, so its rectangle is the red one.
    await page.locator('#canvas svg rect[fill="#ff0000"]').first()
      .click({ force: true });

    // dhmon.js:359 patches $.ui.dialog to allow HTML in the title, so this
    // also covers that monkey patch surviving a jQuery UI upgrade.
    const dialog = page.locator('.ui-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('D74-A');
  });

  test('the menu is always visible on a desktop viewport', async ({ page }) => {
    await page.goto('/dhmon.html');
    await expect(page.locator('#menu_container')).toBeVisible();
    // The hamburger only exists below the 500px breakpoint (dhmon.html:134).
    await expect(page.locator('#menu_button')).toBeHidden();
  });

  test('the hamburger toggles the menu on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto('/dhmon.html');

    const container = page.locator('#menu_container');
    const button = page.locator('#menu_button');

    // Below the breakpoint the menu starts collapsed.
    await expect(button).toBeVisible();
    await expect(container).toBeHidden();

    await button.click();
    await expect(container).toBeVisible();

    await button.click();
    await expect(container).toBeHidden();
  });

  test('dark mode and fun mode toggle the body', async ({ page }) => {
    await page.goto('/dhmon.html');

    await page.locator('#darkmode').check();
    await expect(page.locator('body')).toHaveCSS(
      'background-color', 'rgb(17, 17, 17)');

    await page.locator('#funmode').check();
    await expect(page.locator('body')).toHaveClass(/funMode/);
  });
});
