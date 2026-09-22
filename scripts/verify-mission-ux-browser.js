// Raw Playwright CLI run-code function: run from the checkout root in a NEW named session.
// Wait for the rebuilt server, then use --filename scripts/verify-mission-ux-browser.js --raw.
// No @playwright/test, mocked responses, direct storage writes, or React-state changes.
// eslint-disable-next-line no-unused-expressions -- Playwright CLI invokes this function with page.
async (page) => {
  const base = 'http://127.0.0.1:3016';
  const out = 'output/playwright/ux-2026-09-19';
  const run = `ux-${Date.now()}`;
  const checks = [], groups = [], downloads = [], maps = [], themes = [];
  const pageErrors = [], consoleErrors = [], tileFailures = [];
  let failure = null, solve = null;
  const onError = (error) => pageErrors.push(error.message);
  const onConsole = (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() });
  };
  const onRequestFailed = (request) => {
    if (request.url().includes('tile.openstreetmap.org')) tileFailures.push(request.url());
  };
  const onDialog = async (dialog) => {
    if (dialog.type() === 'beforeunload') await dialog.accept();
    else throw new Error(`Unexpected browser dialog: ${dialog.type()}`);
  };
  const assert = (name, pass, detail = '') => {
    checks.push({ name, pass: Boolean(pass), detail });
    if (!pass) throw new Error(`${name}: ${detail}`);
  };
  const group = async (name, work) => {
    const record = { name, status: 'running', startedAt: new Date().toISOString() };
    groups.push(record);
    await work();
    record.status = 'pass';
  };
  const stable = (value) => Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
      : value;
  const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  const screenshot = (name) => page.screenshot({ path: `${out}/${run}-${name}.png`, fullPage: true });
  const close = () => page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  const exported = async (name) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const file = await pending;
    const path = `${out}/${run}-${name}.mission.json`;
    await file.saveAs(path);
    assert(`download ${name}`, (await file.failure()) === null);
    let text = '';
    for await (const chunk of await file.createReadStream()) text += chunk.toString();
    downloads.push({ path, suggestedFilename: file.suggestedFilename() });
    return JSON.parse(text);
  };
  const importMission = async (id) => {
    await page.getByLabel('Файл задания миссии', { exact: true })
      .setInputFiles(`public/planner/scenarios/${id}.mission.json`);
    const dialog = page.getByRole('dialog', { name: 'Проверка перед загрузкой', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const mapState = async (name, previousId) => {
    await page.locator('.mission-map[data-map-ready="true"] .mission-map-canvas.leaflet-container').waitFor();
    const state = await page.locator('.mission-map-canvas').evaluate((host) => {
      const box = host.getBoundingClientRect();
      const style = getComputedStyle(host);
      const canvases = [...host.querySelectorAll('.leaflet-overlay-pane canvas')].map((canvas) => {
        let ink = false;
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (data) for (let i = 3; i < data.length; i += 4) if (data[i] > 0) { ink = true; break; }
        return { width: canvas.width, height: canvas.height, ink };
      });
      return {
        id: host._leaflet_id,
        classes: host.className,
        drawing: host.parentElement.dataset.drawing,
        width: box.width, height: box.height,
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        panes: host.querySelectorAll('.leaflet-pane').length,
        canvases,
      };
    });
    maps.push({ name, ...state });
    assert(`${name}: usable Leaflet surface`, state.visible && state.width > 100 && state.height > 100 && state.panes > 0, JSON.stringify(state));
    assert(`${name}: rendered vector geometry`, state.canvases.some((canvas) => canvas.ink), JSON.stringify(state.canvases));
    assert(`${name}: library CSS ownership retained`, state.classes.includes('leaflet-container') && state.classes.includes('leaflet-grab'), state.classes);
    if (previousId !== undefined) assert(`${name}: same map instance`, state.id === previousId, `${state.id} / ${previousId}`);
    return state;
  };
  const theme = page.getByRole('combobox', { name: 'Тема интерфейса', exact: true });
  const expectTheme = async (name, preference, resolved) => {
    await page.waitForFunction(({ preference, resolved }) => document.documentElement.dataset.primeTheme === resolved && document.documentElement.dataset.primeThemePreference === preference, { preference, resolved });
    const state = await page.evaluate(() => ({
      preference: document.documentElement.dataset.primeThemePreference,
      resolved: document.documentElement.dataset.primeTheme,
      persisted: localStorage.getItem('prime:mission-theme:v1'),
      background: getComputedStyle(document.querySelector('.mission-workbench')).backgroundColor,
      foreground: getComputedStyle(document.querySelector('.mission-workbench')).color,
      colorScheme: getComputedStyle(document.querySelector('.mission-workbench')).colorScheme,
      mediaDark: matchMedia('(prefers-color-scheme: dark)').matches,
    }));
    themes.push({ name, ...state });
    assert(`${name}: preference and actual theme`, state.preference === preference && state.resolved === resolved && await theme.inputValue() === preference, JSON.stringify(state));
    assert(`${name}: preference persisted by UI`, state.persisted === preference, JSON.stringify(state));
    return state;
  };
  const coordinateFrom = (text) => {
    const match = text.match(/([\d.]+)°\s*([NS])\s*·\s*([\d.]+)°\s*([EW])/);
    if (!match) throw new Error(`Missing displayed WGS84 coordinates: ${text}`);
    return [Number(match[3]) * (match[4] === 'W' ? -1 : 1), Number(match[1]) * (match[2] === 'S' ? -1 : 1)];
  };
  const drawPoints = async (fractions) => {
    const host = page.locator('.mission-map-canvas');
    await host.scrollIntoViewIfNeeded();
    const box = await host.boundingBox();
    assert('drawing map has measurable bounds', !!box);
    const coordinates = [];
    for (const [index, [x, y]] of fractions.entries()) {
      await host.click({ position: { x: box.width * x, y: box.height * y } });
      await page.waitForFunction((count) => document.querySelectorAll('.mission-map-point-label').length === count, index + 1);
      const text = await page.locator('.mission-map-coordinates span').nth(1).innerText();
      coordinates.push(coordinateFrom(text));
    }
    return coordinates;
  };
  const startArea = () => page.getByRole('button', { name: 'Нарисовать область работ', exact: true }).click();
  const moveOffHint = async (dialog) => {
    const box = await dialog.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 18);
  };
  const tooltipInsideViewport = async (name) => {
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor();
    const box = await tooltip.boundingBox();
    const viewport = page.viewportSize();
    assert(`${name}: tooltip within viewport`, !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify(box));
    return tooltip;
  };
  page.on('pageerror', onError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('dialog', onDialog);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`${base}/planner`, { waitUntil: 'domcontentloaded' });
    await theme.waitFor(); // Fails on the old build: never silently accepts missing new UI.
    await group('1. Light, dark, system media and persistence', async () => {
      await theme.selectOption('dark');
      const dark = await expectTheme('explicit dark with light media', 'dark', 'dark');
      await screenshot('01-dark');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectTheme('dark after reload', 'dark', 'dark');
      await theme.selectOption('light');
      await page.emulateMedia({ colorScheme: 'dark' });
      const light = await expectTheme('explicit light with dark media', 'light', 'light');
      assert('theme changes rendered colors, not only data attributes', dark.background !== light.background && dark.foreground !== light.foreground);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectTheme('light after reload', 'light', 'light');
      await theme.selectOption('system');
      await expectTheme('system follows dark media', 'system', 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await expectTheme('system follows a live media change', 'system', 'light');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectTheme('system preference after reload', 'system', 'light');
      await screenshot('02-system-light');
    });
    await group('2. Scenario gallery, mission import and offline vector geometry', async () => {
      await page.getByRole('button', { name: 'Сценарии', exact: true }).click();
      const gallery = page.getByRole('dialog', { name: 'Демонстрационные сценарии', exact: true });
      await gallery.waitFor();
      assert('gallery retains all showcase examples', await gallery.locator('.ms-scenario').count() >= 9);
      assert('synthetic inputs are clearly disclosed', (await gallery.innerText()).includes('не официальные входные данные'));
      await close();
      await importMission('automatic-tradeoff');
      const before = await exported('imported-original');
      await theme.selectOption('dark');
      await expectTheme('mission dark switch', 'dark', 'dark');
      await theme.selectOption('light');
      await expectTheme('mission light switch', 'light', 'light');
      const after = await exported('after-theme-only');
      assert('theme does not mutate any mission field', same(before, after));
      const tiles = page.getByRole('button', { name: 'Подложка', exact: true });
      if (await tiles.getAttribute('aria-pressed') === 'true') await tiles.click();
      await page.waitForFunction(() => !document.querySelector('.mission-map-canvas .leaflet-tile-pane img'));
      assert('base tiles disabled through the UI', await tiles.getAttribute('aria-pressed') === 'false');
      const state = await mapState('offline initial');
      const host = page.locator('.mission-map-canvas');
      await host.scrollIntoViewIfNeeded();
      const box = await host.boundingBox();
      await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.36);
      await page.waitForFunction(() => document.querySelector('.mission-map-coordinates')?.textContent.includes('°'));
      const cursor = await page.locator('.mission-map-coordinates span').first().innerText();
      assert('cursor uses actual readable WGS84 coordinates', coordinateFrom(cursor).every(Number.isFinite), cursor);
      await screenshot('03-offline-cursor');
      await mapState('cursor rerender', state.id);
    });
    await group('3. Draft, Escape and explicit cancel preserve every input field', async () => {
      const original = await exported('before-cancel');
      const initial = await mapState('before drawing');
      await startArea();
      await drawPoints([[0.43, 0.36], [0.65, 0.39]]);
      assert('incomplete polygon cannot be applied', await page.getByRole('button', { name: 'Применить контур', exact: true }).isDisabled());
      assert('numbered draft vertices visible', await page.locator('.mission-map-point-label').allTextContents().then((values) => same(values, ['1', '2'])));
      await mapState('drawing mode retains Leaflet classes', initial.id);
      await screenshot('04-drawing-before-escape');
      await page.keyboard.press('Escape');
      await page.locator('.mw-map-draw').waitFor({ state: 'hidden' });
      // Leaflet fades detached tooltip overlays for 200 ms before removing their DOM.
      await page.waitForFunction(() => document.querySelectorAll('.mission-map-point-label').length === 0);
      assert('Escape removes draft markers', await page.locator('.mission-map-point-label').count() === 0);
      assert('Escape leaves mission unchanged', same(await exported('after-escape'), original));
      await startArea();
      await drawPoints([[0.47, 0.37], [0.64, 0.44]]);
      await page.locator('.mw-map-draw').getByRole('button', { name: 'Отмена', exact: true }).click();
      await page.locator('.mw-map-draw').waitFor({ state: 'hidden' });
      assert('explicit cancel leaves mission unchanged', same(await exported('after-explicit-cancel'), original));
      await mapState('after both cancel paths', initial.id);
    });
    await group('4. Applying a real drawn polygon commits coordinates and keeps the map', async () => {
      const original = await exported('before-apply');
      const initial = await mapState('before apply');
      await startArea();
      const points = await drawPoints([[0.42, 0.35], [0.65, 0.37], [0.65, 0.58], [0.43, 0.58]]);
      assert('four vertices enable apply', await page.getByRole('button', { name: 'Применить контур', exact: true }).isEnabled());
      await page.locator('.mission-map-draft-list summary').click();
      assert('draft coordinate list has all vertices', await page.locator('.mission-map-draft-list li').count() === 4);
      await screenshot('05-draft-coordinates');
      await page.getByRole('button', { name: 'Применить контур', exact: true }).click();
      await page.locator('.mw-map-draw').waitFor({ state: 'hidden' });
      const after = await exported('after-apply');
      const ring = after.jobs[0].area.coordinates[0];
      assert('applied polygon closes exactly', ring.length === 5 && same(ring[0], ring[4]));
      assert('actual coordinates match displayed clicks to display precision', points.every((point, i) => point.every((value, axis) => Math.abs(value - ring[i][axis]) <= 0.00000051)), JSON.stringify({ points, ring }));
      const originalWithoutArea = { ...original, jobs: original.jobs.map((job) => ({ ...job, area: null })) };
      const afterWithoutArea = { ...after, jobs: after.jobs.map((job) => ({ ...job, area: null })) };
      assert('draw apply changes only the selected area', same(originalWithoutArea, afterWithoutArea) && !same(original.jobs[0].area, after.jobs[0].area));
      await mapState('after applied geometry', initial.id);
      await page.getByRole('button', { name: 'Показать всю область', exact: true }).click();
      await mapState('after explicit fit', initial.id);
      await screenshot('06-applied-polygon');
    });
    await group('5. Actual calculation retains the map; comparison exposes real model candidates', async () => {
      await importMission('automatic-tradeoff');
      const before = await mapState('before actual calculation');
      const pending = page.waitForResponse((response) => response.url() === `${base}/api/planner/missions/solve` && response.request().method() === 'POST', { timeout: 120000 });
      await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
      const response = await pending;
      assert('real solve HTTP success', response.status() === 200, String(response.status()));
      const result = await response.json();
      solve = { inputHash: result.inputHash, candidates: result.candidates.map((candidate) => ({ id: candidate.id, status: candidate.status, metrics: candidate.metrics })), recommendation: result.recommendation ? { id: result.recommendation.candidate.id, status: result.recommendation.candidate.status, metrics: result.recommendation.candidate.metrics } : null };
      await page.getByRole('button', { name: 'Сравнить и объяснить варианты', exact: true }).waitFor();
      assert('fixture produced the validated pair and real recommendation', result.candidates.length === 2 && result.candidates.every((candidate) => candidate.status === 'feasible_model') && result.recommendation?.candidate.status === 'feasible_model');
      await mapState('after actual calculation', before.id);
      await screenshot('07-calculated-map');
      await page.getByRole('button', { name: 'Сравнить и объяснить варианты', exact: true }).click();
      const comparison = page.getByRole('dialog', { name: 'Сравнение вариантов миссии', exact: true });
      await comparison.waitFor();
      assert('comparison contains exactly three plans', await comparison.locator('table').first().locator('tbody tr').count() === 3);
      assert('quality is a safety gate, not a fabricated fourth plan', (await comparison.innerText()).includes('Качество — обязательное условие, а не четвёртый вариант'));
      await comparison.getByRole('button', { name: 'Баланс', exact: true }).click();
      assert('balanced row is selected', (await comparison.locator('tr.ms-selected').innerText()).includes('Баланс'));
      await screenshot('08-comparison');
    });
    await group('6. Help supports hover, focus, pinning and Escape inside a modal', async () => {
      const comparison = page.getByRole('dialog', { name: 'Сравнение вариантов миссии', exact: true });
      const hint = comparison.getByRole('button', { name: 'Пояснение: Суммарный налёт', exact: true });
      await hint.hover();
      let tooltip = await tooltipInsideViewport('hover help');
      assert('hover explains actual flight-time semantics', (await tooltip.innerText()).includes('Два БВС по 10 минут дают 20 минут налёта'));
      await tooltip.hover();
      await page.waitForTimeout(220); // Intentionally exceeds the 160 ms hover-close grace period.
      assert('pointer can enter and read tooltip', await tooltip.isVisible());
      await screenshot('09-hover-help');
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      assert('Escape closes help without closing comparison', await comparison.isVisible());
      await moveOffHint(comparison);
      await comparison.getByRole('button', { name: 'Баланс', exact: true }).focus();
      await hint.focus();
      tooltip = await tooltipInsideViewport('keyboard focus help');
      assert('focused hint is connected to its explanation', await hint.getAttribute('aria-describedby') === await tooltip.getAttribute('id'));
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      assert('focus help Escape preserves modal', await comparison.isVisible());
      await hint.click();
      tooltip = await tooltipInsideViewport('click-pinned help');
      await moveOffHint(comparison);
      await page.waitForTimeout(220);
      assert('clicked help remains readable after pointer leaves', await tooltip.isVisible());
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      assert('pinned help Escape preserves comparison', await comparison.isVisible());
      await page.keyboard.press('Escape');
      await comparison.waitFor({ state: 'hidden' });
      await mapState('after comparison and tooltip lifecycle');
    });
    await group('7. Mobile resize, theme and modal tooltip stay usable', async () => {
      const previous = await mapState('desktop before resize');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.mission-map-canvas').scrollIntoViewIfNeeded();
      await mapState('mobile after resize', previous.id);
      const size = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert('mobile has no page-wide horizontal overflow', size.scrollWidth <= size.width + 1, JSON.stringify(size));
      await theme.selectOption('dark');
      await expectTheme('mobile dark', 'dark', 'dark');
      await screenshot('10-mobile-dark');
      await page.getByRole('button', { name: 'Сравнить и объяснить варианты', exact: true }).click();
      const comparison = page.getByRole('dialog', { name: 'Сравнение вариантов миссии', exact: true });
      const box = await comparison.boundingBox();
      assert('mobile comparison fits viewport', !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845, JSON.stringify(box));
      await comparison.getByRole('button', { name: 'Пояснение: Что проверяется по качеству', exact: true }).click();
      await tooltipInsideViewport('mobile quality help');
      await screenshot('11-mobile-modal-help');
      await page.keyboard.press('Escape');
      assert('mobile hint Escape leaves comparison open', await comparison.isVisible());
      await close();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await theme.selectOption('system');
      await page.emulateMedia({ colorScheme: 'light' });
      await expectTheme('final system light', 'system', 'light');
      await mapState('desktop restored', previous.id);
      assert('zero uncaught browser errors', pageErrors.length === 0, JSON.stringify(pageErrors));
      await screenshot('12-final-desktop');
    });
  } catch (error) {
    failure = error.message;
    if (groups.at(-1)?.status === 'running') groups.at(-1).status = 'fail';
    try { await screenshot('failure'); } catch { /* Keep the original diagnostic if the page was lost. */ }
  } finally {
    page.off('pageerror', onError);
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
    page.off('dialog', onDialog);
  }
  return {
    checkedAt: new Date().toISOString(), base, run, artifactDirectory: out,
    status: failure ? 'fail' : 'pass', failure, groups, checks, maps, themes,
    pageErrors, consoleErrors, tileFailureCount: tileFailures.length,
    downloads, solve,
    limitations: [
      'Requires a fresh named Playwright CLI session; no existing user profile is cleared.',
      'Media emulation is a browser preference test, not a mocked application response.',
      'Map geometry is checked without base tiles by the real UI toggle; OSM availability is not asserted.',
      'No operational sessions, flight telemetry, weather feeds or physical flights are tested.',
    ],
  };
}
