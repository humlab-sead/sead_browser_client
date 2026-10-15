// @ts-check
const { test, expect } = require('@playwright/test');

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/SEAD/);
});

//test for the domain menu - click the #domain-menu button and expect #domains-menu-anchor-point to be visible
test('domain menu', async ({ page }) => {
  await page.goto('/');

  // Click the domain menu button.
  await page.click('#domain-menu');

  // Expects the domain menu to be visible.
  await expect(page.locator('#domains-menu-anchor-point')).toBeVisible();
});


//same test as above but for #facet-menu and #filters-menu-anchor-point
test('filter menu', async ({ page }) => {
  await page.goto('/');

  // Click the filter menu button.
  await page.click('#facet-menu');

  // Expects the filter menu to be visible.
  await expect(page.locator('#filters-menu-anchor-point')).toBeVisible();
});


// click on: #result-menu > [menu-item='map'] and expect it to receive the class .sqs-menu-selected
test('map menu', async ({ page }) => {
  await page.goto('/');

  // Click the map menu button.
  await page.click('#result-menu > [menu-item="map"]');

  // Expects the map menu to have the class .sqs-menu-selected.
  await expect(page.locator('#result-menu > [menu-item="map"]')).toHaveClass(/sqs-menu-selected/);

});

//same as above, but click on menu-item='table'
test('table menu', async ({ page }) => {
  await page.goto('/');

  // Click the table menu button.
  await page.click('#result-menu > [menu-item="table"]');

  // Expects the table menu to have the class .sqs-menu-selected.
  await expect(page.locator('#result-menu > [menu-item="table"]')).toHaveClass(/sqs-menu-selected/);
});


//same as above, but click on menu-item='mosaic'
test('mosaic menu', async ({ page }) => {
  await page.goto('/');

  // Click the mosaic menu button.
  await page.click('#result-menu > [menu-item="mosaic"]');

  // Expects the mosaic menu to have the class .sqs-menu-selected.
  await expect(page.locator('#result-menu > [menu-item="mosaic"]')).toHaveClass(/sqs-menu-selected/);
});

//the overview shows the result in figures and its charts can be switched to tables
test('overview charts', async ({ page }) => {
  await page.goto('/');
  await page.click('#result-menu > [menu-item="mosaic"]');

  await expect(page.locator('#result-mosaic-summary [data-summary="sites"] .mosaic-summary-value')).toHaveText(/\d/, { timeout: 30000 });

  const analysisMethods = page.locator('.result-mosaic-tile', { has: page.locator('.mosaic-tile-title', { hasText: 'Analytical methods' }) });
  await expect(analysisMethods.locator('.mosaic-bar-row').first()).toBeVisible({ timeout: 30000 });

  await analysisMethods.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(analysisMethods.locator('.mosaic-data-table tbody tr').first()).toBeVisible();
  await expect(analysisMethods.locator('.mosaic-bar-row')).toHaveCount(0);
});

//the dendrochronology overview draws its variables as bars and histograms, each with its coverage of the samples
test('dendrochronology overview charts', async ({ page }) => {
  await page.goto('/dendrochronology');
  await page.click('#result-menu > [menu-item="mosaic"]');

  const treeSpecies = page.locator('.result-mosaic-tile', { has: page.locator('.mosaic-tile-title', { hasText: 'Tree species' }) });
  await expect(treeSpecies.locator('.mosaic-bar-row').first()).toBeVisible({ timeout: 30000 });
  await expect(treeSpecies.locator('.mosaic-coverage-value')).toHaveText(/%/, { timeout: 30000 });

  const treeRings = page.locator('.result-mosaic-tile', { has: page.locator('.mosaic-tile-title', { hasText: 'Tree rings' }) });
  await expect(treeRings.locator('.mosaic-tile-canvas canvas')).toBeVisible({ timeout: 30000 });
  await treeRings.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(treeRings.locator('.mosaic-data-table tbody tr').first()).toBeVisible();
});

//clicking an eco code in the palaeoentomology overview filters by it, through the staged eco code filter
test('eco code bar adds filter', async ({ page }) => {
  await page.goto('/palaeoentomology');
  await page.click('#result-menu > [menu-item="mosaic"]');

  const ecoCodes = page.locator('.result-mosaic-tile', { has: page.locator('.mosaic-tile-title', { hasText: 'BUGS eco codes' }) });
  await expect(ecoCodes.locator('button.mosaic-bar-row').first()).toBeVisible({ timeout: 30000 });
  await ecoCodes.locator('button.mosaic-bar-row').first().click();

  await expect.poll(() => page.evaluate(() => {
    const facet = window.sqs.facetManager.getFacetByName('ecocode');
    return facet ? facet.filters.map(stage => stage.name+':'+stage.selections.length).join(',') : null;
  }), { timeout: 30000 }).toBe('ecocode_system:1,ecocode:1');
  await expect(ecoCodes.locator('button.mosaic-bar-row[aria-pressed="true"]')).toHaveCount(1, { timeout: 30000 });
});


//open filter menu and click on "Space/Time" submenu and then click on "Site" filter (which will be called #facet-1) and expect to have it deployed in #facet-section
test('filter deployment', async ({ page }) => {
  await page.goto('/');

  // Click the filter menu button.
  await page.click('#facet-menu');

  // Click the Space/Time submenu.
  await page.click('#filters-menu-anchor-point > [menu-item="space_time"]');

  // Click the Site filter.
  await page.click('#filters-menu-anchor-point > div > [menu-item="sites"]');

  // Expects the Site filter to be deployed in the facet section (look for element with id #facet-1).
  await expect(page.locator('#facet-section > #facet-1')).toBeVisible();
});

test('site route popstate to filters restores a result module', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/site/1');
  await expect(page.locator('#site-report-main-container')).toBeVisible({ timeout: 30000 });

  await page.evaluate(() => {
    history.replaceState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await expect(page.locator('#filter-view-main-container')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#result-menu > [menu-item].sqs-menu-selected')).toHaveCount(1);
  expect(pageErrors.join("\n")).not.toContain("render is not a function");
});
