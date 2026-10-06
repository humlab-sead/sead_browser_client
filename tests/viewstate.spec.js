// @ts-check
const { test, expect } = require('@playwright/test');

/*
* A viewstate is a saved copy of the interface - domain, filters and their selections, the result view and
* its settings, the layout and an open site report - which /viewstate/<id> puts back. Saving needs a signed-in
* user, so loading is tested here against viewstates served by the test itself, in the shape the client saves.
*/

const VIEWSTATE_ID = 'smoke-test-viewstate';

//Eco code is a staged filter: saved as one entry per stage, which loading has to put back together.
//System 2 is "Bugs Ecocodes".
const VIEWSTATE = {
  id: VIEWSTATE_ID,
  name: 'Smoke test',
  apiVersion: '2022.4.15.0',
  clientVersion: '2026-10.0',
  saved: 1791277787000,
  layout: { left: 45 },
  facets: [
    { name: 'ecocode_system', position: 1, selections: [2], type: 'multistage', minimized: false },
    { name: 'ecocode', position: 2, selections: [], type: 'multistage', minimized: false },
    { name: 'abundances_all', position: 3, selections: [5, 50], type: 'range', minimized: false },
    { name: 'country', position: 4, selections: [], type: 'discrete', minimized: true }
  ],
  result: {
    module: 'map',
    settings: { center: [1500000, 8500000], zoom: 6.5, baseLayers: ['osm'], dataLayers: ['points'] }
  },
  siteReport: { active: false },
  domain: 'palaeoentomology'
};

async function serveViewstate(page, id, viewstates) {
  await page.route('**/jsonapi/viewstate/'+id, route => route.fulfill({ json: viewstates }));
}

async function waitForSystem(page) {
  await page.waitForFunction(() => window.sqs && window.sqs.systemReady);
}

test.describe('viewstates', () => {
  test('a viewstate puts back its domain, filters, result view and layout', async ({ page }) => {
    await serveViewstate(page, VIEWSTATE_ID, [VIEWSTATE]);
    await page.goto('/viewstate/'+VIEWSTATE_ID);
    await waitForSystem(page);

    //The domain switch must not sweep the filters away after they are restored
    await page.waitForFunction(() => {
      const fm = window.sqs.facetManager;
      const country = fm.getFacetByName('country');
      return fm.facets.length == 3 && country && country.minimized;
    }, null, { timeout: 30000 });

    const state = await page.evaluate(() => {
      const fm = window.sqs.facetManager;
      const ecocode = fm.getFacetByName('ecocode');
      return {
        domain: window.sqs.domainManager.getActiveDomain().name,
        facets: fm.getFacetState().map(entry => entry.name+':'+JSON.stringify(entry.selections)),
        ecocodeStage: ecocode.currentFilterStage,
        ecocodeSystemsLoaded: ecocode.filters[0].data.length,
        facetNodes: $('#facet-section .facet').length,
        left: Math.round(window.sqs.layoutManager.getViewByName('filters').leftLastSize)
      };
    });
    expect(state.domain).toBe('palaeoentomology');
    expect(state.facets).toEqual([
      'ecocode_system:[2]',
      'ecocode:[]',
      'abundances_all:[5,50]',
      'country:[]'
    ]);
    //Standing on the codes of the chosen system, with the systems loaded for the back button
    expect(state.ecocodeStage).toBe(1);
    expect(state.ecocodeSystemsLoaded).toBeGreaterThan(0);
    expect(state.facetNodes).toBe(3);
    expect(state.left).toBe(45);

    //The map takes the saved view rather than fitting itself to the data
    await page.waitForFunction(() => {
      const map = window.sqs.resultManager.getResultModuleByName('map');
      return window.sqs.resultManager.activeModuleId == 'map' && map.olMap && map.data && map.data.length > 0;
    }, null, { timeout: 30000 });
    const map = await page.evaluate(() => window.sqs.resultManager.getResultModuleByName('map').exportSettings());
    expect(map.center.map(Math.round)).toEqual([1500000, 8500000]);
    expect(map.zoom).toBeCloseTo(6.5);
    expect(map.baseLayers).toEqual(['osm']);
    expect(map.dataLayers).toEqual(['points']);

    expect(new URL(page.url()).pathname).toBe('/viewstate/'+VIEWSTATE_ID);
  });

  test('a viewstate which does not exist leaves a working page', async ({ page }) => {
    await serveViewstate(page, 'no-such-viewstate', []);
    await page.goto('/viewstate/no-such-viewstate');
    await waitForSystem(page);

    await page.waitForFunction(() => window.location.pathname == '/');
    //The result loads as it would without a viewstate, and the loading cover comes down
    await page.waitForFunction(() => {
      const module = window.sqs.resultManager.getActiveModule();
      return module && module.getSiteCount() > 0;
    }, null, { timeout: 30000 });
    await expect(page.locator('[id^=cover-tile-]')).toHaveCount(0, { timeout: 10000 });
  });

  test('saving describes the map view and leaves out a closed site report', async ({ page }) => {
    await page.goto('/site/1');
    await waitForSystem(page);
    await page.waitForFunction(() => window.sqs.activeView == 'siteReport');
    await page.evaluate(() => window.sqs.siteReportManager.unrenderSiteReport());

    await page.evaluate(() => window.sqs.resultManager.setActiveModule('map'));
    await page.waitForFunction(() => {
      const map = window.sqs.resultManager.getResultModuleByName('map');
      return map.olMap && map.data && map.data.length > 0;
    }, null, { timeout: 30000 });

    const state = await page.evaluate(() => window.sqs.stateManager.saveState());
    expect(state.result.module).toBe('map');
    expect(state.result.settings.center).toHaveLength(2);
    expect(typeof state.result.settings.zoom).toBe('number');
    expect(state.result.settings.dataLayers.length).toBe(1);
    expect(state.siteReport.active).toBe(false);
    expect(typeof state.layout.left).toBe('number');
  });
});
