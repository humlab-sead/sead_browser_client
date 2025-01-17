// @ts-check
const { test, expect } = require('@playwright/test');

test('has title', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/SEAD/);
});

//test for the domain menu - click the #filter-menu-domain-area button and expect #domains-menu-anchor-point to be visible
test('domain menu', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click the domain menu button.
  await page.click('#filter-menu-domain-area');

  // Expects the domain menu to be visible.
  await expect(page.locator('#domains-menu-anchor-point')).toBeVisible();
});


//same test as above but for #filter-menu-filter-area and #filters-menu-anchor-point
test('filter menu', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click the filter menu button.
  await page.click('#filter-menu-filter-area');

  // Expects the filter menu to be visible.
  await expect(page.locator('#filters-menu-anchor-point')).toBeVisible();
});


// click on: #result-menu > [menu-item='map'] and expect it to receive the class .sqs-menu-selected
test('map menu', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click the map menu button.
  await page.click('#result-menu > [menu-item="map"]');

  // Expects the map menu to have the class .sqs-menu-selected.
  await expect(page.locator('#result-menu > [menu-item="map"]')).toHaveClass(/sqs-menu-selected/);

});

//same as above, but click on menu-item='table'
test('table menu', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click the table menu button.
  await page.click('#result-menu > [menu-item="table"]');

  // Expects the table menu to have the class .sqs-menu-selected.
  await expect(page.locator('#result-menu > [menu-item="table"]')).toHaveClass(/sqs-menu-selected/);
});


//same as above, but click on menu-item='mosaic'
test('mosaic menu', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click the mosaic menu button.
  await page.click('#result-menu > [menu-item="mosaic"]');

  // Expects the mosaic menu to have the class .sqs-menu-selected.
  await expect(page.locator('#result-menu > [menu-item="mosaic"]')).toHaveClass(/sqs-menu-selected/);
});


//open filter menu and click on "Space/Time" submenu and then click on "Site" filter (which will be called #facet-1) and expect to have it deployed in #facet-section
test('filter deployment', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click the filter menu button.
  await page.click('#filter-menu-filter-area');

  // Click the Space/Time submenu.
  await page.click('#filters-menu-anchor-point > [menu-item="space_time"]');

  // Click the Site filter.
  await page.click('#filters-menu-anchor-point > div > [menu-item="sites"]');

  // Expects the Site filter to be deployed in the facet section (look for element with id #facet-1).
  await expect(page.locator('#facet-section > #facet-1')).toBeVisible();
});