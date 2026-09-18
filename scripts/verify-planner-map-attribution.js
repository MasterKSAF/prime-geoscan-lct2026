async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:3016/planner');
  await page.locator('.leaflet-control-attribution a[href="https://leafletjs.com"]').waitFor();
  await page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]').waitFor();
  const result = await page.evaluate(() => ({
    flags: document.querySelectorAll('.leaflet-attribution-flag').length,
    attribution: document.querySelector('.leaflet-control-attribution')?.textContent,
    leaflet: document.querySelector('.leaflet-control-attribution a[href="https://leafletjs.com"]')?.textContent,
    osm: document.querySelector('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]')?.textContent,
  }));
  if (result.flags !== 0 || result.leaflet !== 'Leaflet' || result.osm !== 'OpenStreetMap') throw new Error(JSON.stringify(result));
  await page.screenshot({ path: 'output/playwright/geoscan-map-2026-09-17/attribution-desktop.png' });
  await page.locator('.leaflet-control-attribution').screenshot({ path: 'output/playwright/geoscan-map-2026-09-17/attribution-detail.png' });
  return { ...result, scope: 'map-attribution-only', flagRemoved: true, requiredCreditsPreserved: true };
}
