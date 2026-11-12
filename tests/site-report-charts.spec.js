// @ts-check
const { test, expect } = require('@playwright/test');

/*
* The site report draws datasets with a value or a few per sample, such as loss on ignition, phosphates and
* magnetic susceptibility, the same way: as bars over the samples, in the order of their names, or as sorted in the
* dataset's header. When the samples have depths, they can also be drawn as a depth profile, which is what is shown
* when the samples are down a profile. The views are switched between in the header too.
*/

async function openMethod(page, siteId, methodId) {
  await page.goto('/site/' + siteId);
  await expect(page.locator('#site-report-main-container')).toBeVisible({ timeout: 30000 });
  await page.locator('.site-report-summary-analyses').click();
  await page.locator('.site-report-method-nav-item[data-method-id="' + methodId + '"]').click();
}

//The bars of the chart's first series
function bars(locator) {
  return locator.locator('.site-report-chart-container .cartesianlayer .barlayer .trace').first().locator('.point');
}

function selectedView(dataset) {
  return dataset.locator('.content-item-view-toggle button[aria-pressed="true"]');
}

async function showView(dataset, name) {
  await dataset.locator('.content-item-view-toggle').getByRole('button', { name: name, exact: true }).click();
}

//a dataset of samples down a profile is shown as a depth profile, with a bar per sample, and as a bar chart if picked
test('depth profile of a stratigraphy', async ({ page }) => {
  await openMethod(page, 87, 32); //Loss on ignition
  const dataset = page.locator('#cic-803');

  await expect(bars(dataset)).toHaveCount(8, { timeout: 30000 });
  await expect(selectedView(dataset)).toHaveText('Depth profile');
  await expect(dataset.locator('.site-report-chart-container .ytitle')).toHaveText('Depth (m)');
  await expect(dataset.locator('.site-report-chart-depth-note')).toHaveCount(0);

  await showView(dataset, 'Bar chart');
  await expect(dataset.locator('.site-report-chart-container .xtitle')).toHaveText('Sample');
  await expect(bars(dataset)).toHaveCount(8);
});

//a survey, with many samples at the same few depths, is shown as a bar chart, and its depth profile names the samples it lacks
test('depth profile of a survey', async ({ page }) => {
  await openMethod(page, 84, 32); //Loss on ignition
  const dataset = page.locator('#cic-340');

  await expect(bars(dataset)).toHaveCount(262, { timeout: 30000 });
  await expect(selectedView(dataset)).toHaveText('Bar chart');

  await showView(dataset, 'Depth profile');
  await expect(dataset.locator('.site-report-chart-depth-note')).toContainText("55 samples aren't shown, as they lack a depth.");

  await dataset.locator('.site-report-chart-depth-note').getByRole('button', { name: 'bar chart' }).click();
  await expect(selectedView(dataset)).toHaveText('Bar chart');
  await expect(dataset.locator('.site-report-chart-depth-note')).toHaveCount(0);
});

//hundreds of samples are still drawn as a bar each, with a range slider to look closer at a part of them, which the note under the chart explains
test('bar chart of many samples', async ({ page }) => {
  await openMethod(page, 76, 37); //Phosphate degrees
  const dataset = page.locator('#cic-385');
  const chart = dataset.locator('.site-report-chart-container');

  await expect(bars(dataset)).toHaveCount(666, { timeout: 30000 });
  await expect(chart.locator('.rangeslider-container')).toHaveCount(1);

  await chart.scrollIntoViewIfNeeded();
  const box = await chart.locator('.draglayer .nsewdrag').first().boundingBox();
  if(!box) {
    throw new Error("The chart's plot area isn't shown");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(chart.locator('.hoverlayer')).toContainText('Phosphate degrees:');

  const zoomNote = dataset.locator('.site-report-chart-zoom-note');
  await expect(zoomNote).toContainText('drag the handles of the overview under the chart');

  //drag the slider's left handle a third of the way in
  const slider = await chart.locator('.rangeslider-bg').boundingBox();
  if(!slider) {
    throw new Error("The chart's range slider isn't shown");
  }
  await page.mouse.move(slider.x + 2, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width / 3, slider.y + slider.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(zoomNote).toContainText(/Showing \d+ of 666 samples/);

  await zoomNote.getByRole('button', { name: 'Show all samples' }).click();
  await expect(zoomNote).toContainText('drag the handles of the overview under the chart');
});

//the bar chart is sorted in the dataset's header, which has nothing left to hide under display options
test('bar chart sorted by value', async ({ page }) => {
  await openMethod(page, 76, 37); //Phosphate degrees
  const dataset = page.locator('#cic-385');
  const sort = dataset.locator('.content-item-header-extras select[aria-label="Sort"]');

  await expect(bars(dataset)).toHaveCount(666, { timeout: 30000 });
  await expect(dataset.locator('.site-report-display-options-container')).toBeHidden();
  await expect(sort.locator('option:checked')).toHaveText('Sample name');

  await sort.selectOption({ label: 'Highest value first' });
  await expect(bars(dataset)).toHaveCount(666);
  const values = await dataset.locator('.site-report-chart-container').evaluate(chart => chart.data[0].y);
  expect(values[0]).toBe(Math.max(...values.filter(value => value != null)));
  expect(values.slice(1).every((value, i) => value == null || value <= values[i])).toBe(true);

  await showView(dataset, 'Spreadsheet');
  await expect(sort).toHaveCount(0);
});
