// @ts-check
const { test, expect } = require('@playwright/test');

/*
* A range filter's chart can switch its y-axis to logarithmic, so that small bars next to a tall one are
* visible. The choice is remembered per filter, across reloads. Whichever it is, the slider's ends have to
* line up with the ends of the bars.
*/

const FACET_CODE = 'tbl_denormalized_measured_values_33_0'; //Magnetic sus. - one very tall bar and a long tail of small ones

const LINEAR_BTN = ".range-chart-scale-btn[data-scale='linear']";
const LOG_BTN = ".range-chart-scale-btn[data-scale='log']";

async function openRangeFacet(page) {
  await page.goto('/');
  await page.waitForFunction((facetCode) => {
    const fm = window.sqs && window.sqs.facetManager;
    return fm && fm.getFacetTemplateByFacetId(facetCode);
  }, FACET_CODE);
  await page.evaluate((facetCode) => {
    const fm = window.sqs.facetManager;
    if (!fm.getFacetByName(facetCode)) {
      fm.addFacet(fm.makeNewFacet(fm.getFacetTemplateByFacetId(facetCode)));
    }
  }, FACET_CODE);
  await expect(page.locator(LOG_BTN)).toBeVisible();
}

//How far, in px, the slider's ends are from the outer edges of the first and last bar
function sliderMisalignment(page) {
  return page.evaluate((facetCode) => {
    const facet = window.sqs.facetManager.getFacetByName(facetCode);
    const canvas = facet.chart.canvas.getBoundingClientRect();
    const bars = facet.chart.getDatasetMeta(0).data;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const slider = $('.noUi-base', facet.getDomRef())[0].getBoundingClientRect();
    return Math.max(
      Math.abs(slider.left - (canvas.left + first.x - first.width / 2)),
      Math.abs(slider.right - (canvas.left + last.x + last.width / 2))
    );
  }, FACET_CODE);
}

function yScaleType(page) {
  return page.evaluate((facetCode) => window.sqs.facetManager.getFacetByName(facetCode).chart.scales.y.type, FACET_CODE);
}

test.describe('range filter', () => {
  test('the y-axis can be made logarithmic, and stays so', async ({ page }) => {
    await openRangeFacet(page);
    await page.evaluate(() => {
      let settings = window.sqs.getUserSettings() || {};
      delete settings.rangeFacetLogScale;
      window.localStorage.setItem('sqsUserSettings', JSON.stringify(settings));
    });

    expect(await yScaleType(page)).toBe('linear');
    await expect(page.locator(LINEAR_BTN)).toHaveAttribute('aria-pressed', 'true');
    expect(await sliderMisalignment(page)).toBeLessThan(3);

    await page.click(LOG_BTN);
    expect(await yScaleType(page)).toBe('logarithmic');
    await expect(page.locator(LOG_BTN)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(LINEAR_BTN)).toHaveAttribute('aria-pressed', 'false');
    expect(await sliderMisalignment(page)).toBeLessThan(3);

    //Only the powers of ten are labelled
    const labels = await page.evaluate((facetCode) => {
      return window.sqs.facetManager.getFacetByName(facetCode).chart.scales.y.ticks.map(t => t.label).filter(l => l != null);
    }, FACET_CODE);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toMatch(/^1(0*|0*k|0*M)$/);
    }

    await page.reload();
    await openRangeFacet(page);
    expect(await yScaleType(page)).toBe('logarithmic');

    await page.click(LINEAR_BTN);
    expect(await yScaleType(page)).toBe('linear');
  });
});
