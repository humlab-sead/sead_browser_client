// @ts-check
const { test, expect } = require('@playwright/test');

/*
* The Timeline filter (analysis_entity_ages) must send the window it shows as picks in plain years BP,
* [younger, older]. It once sent its slider values (BP negated), which the database then shifted by -10000
* to compensate - a pair of errors that cancel out only for windows centred on 5000 BP. So the windows
* checked here are deliberately not centred on 5000 BP.
*/

const FACET_CODE = 'analysis_entity_ages';
//The slider's "now" end, in years BP (negative, since now is after 1950)
const NOW_BP = 1950 - new Date().getFullYear();

//Records the Timeline's picks in every facet load request, so a test can wait for the ones it expects
function recordTimelinePicks(page) {
  const sent = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/facets/load') || request.method() != 'POST') {
      return;
    }
    const body = request.postDataJSON();
    const config = (body.facetConfigs || []).find(fc => fc.facetCode == FACET_CODE);
    if (!config) {
      return;
    }
    const lower = config.picks.find(p => p.pickType == 2);
    const upper = config.picks.find(p => p.pickType == 3);
    if (lower && upper) {
      sent.push([Number(lower.pickValue), Number(upper.pickValue)]);
    }
  });
  return () => sent[sent.length - 1];
}

async function openTimeline(page) {
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
  await expect(page.locator('#timeline-scale-selector')).toBeVisible();
}

test.describe('timeline filter', () => {
  test('the default scale excludes no ages', async ({ page }) => {
    const lastPicks = recordTimelinePicks(page);
    await openTimeline(page);

    await expect.poll(lastPicks).toBeTruthy();
    const [younger, older] = lastPicks();
    expect(younger).toBe(NOW_BP);
    expect(older).toBeGreaterThan(5000000);
  });

  test('the 500 year scale sends its window in years BP', async ({ page }) => {
    const lastPicks = recordTimelinePicks(page);
    await openTimeline(page);

    await page.selectOption('#timeline-scale-selector', '1');
    await expect.poll(lastPicks).toEqual([NOW_BP, NOW_BP + 500]);
  });

  test('a selection set from outside is sent as given and moves the slider', async ({ page }) => {
    const lastPicks = recordTimelinePicks(page);
    await openTimeline(page);

    //As from a viewstate or the agent
    await page.evaluate((facetCode) => {
      window.sqs.facetManager.getFacetByName(facetCode).setSelections([0, 2000]);
    }, FACET_CODE);

    await expect.poll(lastPicks).toEqual([0, 2000]);
    //The smallest scale which fits 0 - 2000 BP
    await expect(page.locator('#timeline-scale-selector')).toHaveValue('3');
  });

  test('the SEAD data points fall inside the axis range', async ({ page }) => {
    await openTimeline(page);
    await page.selectOption('#timeline-scale-selector', '1');

    const graph = async () => page.evaluate((facetCode) => {
      const facet = window.sqs.facetManager.getFacetByName(facetCode);
      const gd = /** @type {any} */ (document.getElementById(facet.timelineDomId));
      const trace = gd && gd.data && gd.data.find(t => t.name == 'SEAD data points');
      if (!trace || !trace.x || trace.x.length == 0) {
        return null;
      }
      return {
        x: Array.from(trace.x),
        width: Array.from(trace.width || []),
        range: Array.from(gd.layout.xaxis.range),
      };
    }, FACET_CODE);

    await expect.poll(async () => {
      const g = await graph();
      return g && g.range[0] - g.range[1];
    }).toBe(500);

    const { x, width, range } = /** @type {{x: number[], width: number[], range: number[]}} */ (await graph());
    const minX = Math.min(...range);
    const maxX = Math.max(...range);
    for (const i of [0, x.length - 1]) {
      const halfWidth = (width[i] || 0) / 2;
      expect(x[i] + halfWidth).toBeGreaterThanOrEqual(minX);
      expect(x[i] - halfWidth).toBeLessThanOrEqual(maxX);
    }
  });
});
