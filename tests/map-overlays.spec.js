// @ts-check
const { test, expect } = require('@playwright/test');

test('RAÄ and MCF catalogues, tiles and legends use the map proxy', async ({ page }) => {
  const externalRequests = [];
  const mapRequests = [];
  const legendRequests = [];
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');

  await page.route(/https?:\/\/(pub\.raa\.se|inspire-raa\.metria\.se|gisapp\.msb\.se|gis-tjanster\.mcf\.se)\//, route => {
    externalRequests.push(route.request().url());
    return route.abort();
  });

  await page.route('**/maps/**', async route => {
    const url = new URL(route.request().url());
    const params = new URLSearchParams([...url.searchParams].map(([key, value]) => [key.toLowerCase(), value]));
    const request = params.get('request')?.toLowerCase();
    if(request === 'getmap') {
      mapRequests.push(url.pathname);
      return route.fulfill({ contentType: 'image/png', body: pixel });
    }
    if(request === 'getlegendgraphic') {
      legendRequests.push({ path: url.pathname, version: params.get('version') });
      return route.fulfill({ contentType: 'image/png', body: pixel });
    }

    let legendUrl;
    if(url.pathname === '/maps/mcf/flooding') {
      legendUrl = 'https://gis-tjanster.mcf.se/arcgis/services/Oversvamningskarteringar/karteringar/MapServer/WMSServer?request=GetLegendGraphic%26version=1.3.0%26format=image/png%26layer=overlay';
    } else if(url.pathname.startsWith('/maps/raa/inspire/')) {
      legendUrl = 'https://inspire-raa.metria.se/geoserver/' + url.pathname.split('/')[4] + '/ows?request=GetLegendGraphic&amp;version=1.3.0&amp;layer=overlay';
    } else {
      legendUrl = 'https://pub.raa.se/visning/' + url.pathname.split('/')[4] + '/ows?request=GetLegendGraphic&amp;version=1.3.0&amp;layer=overlay';
    }
    return route.fulfill({ contentType: 'text/xml', body: `
      <WMS_Capabilities xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.3.0">
        <Capability><Layer><Layer queryable="1">
          <Name>overlay</Name><Title>Test overlay</Title><CRS>EPSG:3857</CRS>
          <Style><Name>default</Name><LegendURL><OnlineResource xlink:href="${legendUrl}"/></LegendURL></Style>
        </Layer></Layer></Capability>
      </WMS_Capabilities>` });
  });
  await page.route('https://maps3.sgu.se/**', route => route.fulfill({
    contentType: 'text/xml',
    body: '<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer/></Capability></WMS_Capabilities>'
  }));

  await page.goto('/');
  await page.locator('#result-menu > [menu-item="map"]').click();
  await page.locator('#result-map-auxlayer-controls-menu').click();
  await expect(page.locator('.aux-layer-checkbox')).toHaveCount(10, { timeout: 30000 });
  await expect(page.locator('.aux-layer-loading')).toHaveCount(0);
  await expect(page.locator('.aux-layer-unavailable-notice')).toHaveCount(0);

  const layers = await page.evaluate(async () => {
    const map = window.sqs.resultManager.getModule('map');
    const overlays = map.layers.filter(layer => layer.get('type') === 'auxLayer');
    await Promise.all(overlays.map(async layer => {
      const image = new Image();
      image.src = layer.get('legendUrl');
      await image.decode();
    }));
    return overlays.map(layer => ({ id: layer.get('layerId'), url: layer.getSource().getUrls()[0] }));
  });
  expect(layers).toHaveLength(10);
  expect(legendRequests).toHaveLength(10);
  expect(legendRequests.every(request => request.version === '1.3.0')).toBe(true);

  for(const prefix of ['/maps/raa/visning/', '/maps/raa/inspire/', '/maps/mcf/']) {
    const layer = layers.find(layer => layer.url.startsWith(prefix));
    expect(layer).toBeTruthy();
    await page.locator(`.aux-layer-checkbox[value="${layer.id}"]`).check();
    await expect.poll(() => mapRequests.some(path => path.startsWith(prefix))).toBe(true);
  }
  expect(externalRequests).toEqual([]);
});
