/**
 * The example page is documentation, so it has to actually work.
 *
 * It sat broken for years - flat-array data from before the hall/Grid rewrite,
 * booleans where status strings belong, and missing DOM elements - without
 * anything noticing. This is what makes that fail loudly next time.
 */
const { test, expect } = require('@playwright/test');

test.describe('src/examples/', () => {
  test('renders the example map without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/src/examples/index.html');

    await expect(page.locator('#canvas svg')).toBeVisible();
    await expect(page.locator('#canvas svg rect')).not.toHaveCount(0);
    expect(errors, 'the example must run clean').toEqual([]);
  });

  test('example.js applies the statuses it documents', async ({ page }) => {
    await page.goto('/src/examples/index.html');
    await expect(page.locator('#canvas svg')).toBeVisible();

    // example.js pushes statuses on a 2s timer. Raphael normalises the
    // rgb() values in dhmap.colour to hex when it writes the SVG, so
    // CRITICAL - rgb(255,0,0) - appears as #ff0000.
    await expect
      .poll(async () => page.evaluate(() => {
        const rects = [...document.querySelectorAll('#canvas svg rect')];
        return rects.map((r) => r.getAttribute('fill'));
      }), { timeout: 10000 })
      .toEqual(expect.arrayContaining(['#ff0000', '#89f56c', '#ffbf00']));
  });
});

// whereami.html has no #menu_container, which dhmap.init dereferences at
// src/dhmap.js:225, so the page throws before drawing anything. Repairing it
// is out of scope here; this records the breakage as a failing expectation
// rather than letting it go unnoticed.
test.fixme('whereami.html renders', async ({ page }) => {
  await page.goto('/whereami.html');
  await expect(page.locator('#canvas svg')).toBeVisible();
});
