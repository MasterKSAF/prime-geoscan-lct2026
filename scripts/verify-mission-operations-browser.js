// Playwright CLI invokes this raw function. No trailing semicolon / test runner.
// eslint-disable-next-line no-unused-expressions -- The CLI supplies page.
async (page) => {
  // Use a NEW isolated CLI session: operations-ux-030-proof. Never clear a user profile.
  // Interactions are real UI. IndexedDB is read-only evidence of exact checkpoints.
  const root = 'C:/Users/Misha/Documents/ChatGPT/LCT';
  const base = 'http://127.0.0.1:3016';
  const out = `${root}/output/playwright/mission-operations-0.3.0`;
  const checks = [], groups = [], snapshots = [], pageErrors = [], requests = [];
  const assert = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw new Error(`${name}: ${detail}`);
  };
  const group = async (name, work) => {
    const row = { name, status: 'running' };
    groups.push(row); await work(); row.status = 'pass';
  };
  const onError = (error) => pageErrors.push(error.message);
  const onRequest = (request) => { if (request.method() === 'POST' && request.url() === `${base}/api/planner/missions/solve`) requests.push({ url: request.url(), at: new Date().toISOString() }); };
  const onDialog = async (dialog) => {
    if (dialog.type() === 'beforeunload' || (dialog.type() === 'confirm' && /Открыть сохранённый снимок|Отменить выполнение/.test(dialog.message()))) await dialog.accept();
  };
  const readRuns = () => page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((db) => db.name === 'prime-planner-operations')) return [];
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open('prime-planner-operations', 1);
      opening.onerror = () => reject(new Error('Read-only QA open failed'));
      opening.onsuccess = () => {
        const db = opening.result, transaction = db.transaction('operations', 'readonly');
        const request = transaction.objectStore('operations').getAll();
        let rows;
        request.onsuccess = () => { rows = request.result; };
        transaction.oncomplete = () => { db.close(); resolve(rows); };
        transaction.onabort = () => { db.close(); reject(new Error('Read-only QA transaction failed')); };
      };
    });
  });
  const waitRun = async (id, predicate, description, timeout = 15000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const row = (await readRuns()).find((r) => r.id === id);
      if (row && predicate(row)) return row;
      await page.waitForTimeout(150);
    }
    throw new Error(`Checkpoint timeout: ${description}`);
  };
  const capture = async (name) => {
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    snapshots.push({ name, text: await page.locator('body').ariaSnapshot() });
  };
  const close = () => page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  const board = () => page.getByRole('region', { name: 'Мои миссии — модельные выполнения', exact: true });
  const openBoard = async () => {
    await page.getByRole('button', { name: 'Мои миссии', exact: true }).click();
    await board().waitFor();
  };
  const card = (id) => board().locator('article.mo-run').filter({ hasText: id });
  const importMission = async (name) => {
    await page.getByLabel('Файл задания миссии', { exact: true }).setInputFiles(`${root}/public/planner/scenarios/${name}.mission.json`);
    const preview = page.getByRole('dialog', { name: 'Проверка перед загрузкой', exact: true });
    await preview.waitFor();
    await preview.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    await preview.waitFor({ state: 'hidden' });
  };
  const solveAndApprove = async () => {
    const pending = page.waitForResponse((r) => r.url() === `${base}/api/planner/missions/solve` && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
    const response = await pending;
    assert('real UI solve HTTP 200', response.status() === 200);
    const result = await response.json();
    await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Подтвердить модельный план', exact: true });
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Подтвердить для симуляции', exact: true }).click();
    await page.getByRole('button', { name: 'План подтверждён', exact: true }).waitFor();
    return result;
  };
  const queue = async () => {
    const ids = new Set((await readRuns()).map((r) => r.id));
    await page.getByRole('button', { name: 'Поставить в план', exact: true }).click();
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      const row = (await readRuns()).find((r) => !ids.has(r.id));
      if (row) return row;
      await page.waitForTimeout(150);
    }
    throw new Error('Approved snapshot was not queued');
  };
  const pausePlayback = async (id) => {
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    return waitRun(id, (r) => r.status === 'paused', 'explicit playback pause');
  };
  page.on('pageerror', onError); page.on('request', onRequest); page.on('dialog', onDialog);
  let primary, duplicate, orphan, expectedDocumentId, failure = null;
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/planner`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Мои миссии', exact: true }).waitFor();
    await group('1. New isolated profile, operations UI and approval gate', async () => {
      const response = await page.request.get(`${base}/api/planner/health`), health = await response.json();
      assert('new integrated engine 0.3.0', response.status() === 200 && health.missionEngineVersion === '0.3.0');
      assert('operations profile initially empty', (await readRuns()).length === 0, 'Do not clear or reuse a populated profile; start a new QA session.');
      await openBoard();
      assert('empty board explains approved snapshots', (await board().innerText()).includes('Выполнений пока нет'));
      await capture('01-empty-board'); await close();
      assert('unapproved simulation blocked', await page.getByRole('button', { name: 'Начать симуляцию', exact: true }).isDisabled());
    });
    await group('2. Direct Open saved mission preserves ID/revision, then queue approved plan', async () => {
      await importMission('automatic-tradeoff');
      expectedDocumentId = 'automatic-tradeoff';
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
      await page.locator('.ms-mission-id').filter({ hasText: 'ревизия 1' }).waitFor();
      await page.getByRole('button', { name: 'Сохранённые задания', exact: true }).click();
      const library = page.getByRole('dialog', { name: /Сохранённые задания|Локальная библиотека миссий/ });
      const saved = library.locator('.mw-library-card').filter({ hasText: expectedDocumentId });
      await saved.getByRole('button', { name: 'Открыть задание', exact: true }).click();
      const preview = page.getByRole('dialog', { name: 'Проверка перед загрузкой', exact: true });
      await preview.waitFor();
      await preview.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
      assert('direct open keeps ID/revision', (await page.locator('.ms-mission-id').innerText()).includes(`${expectedDocumentId} · ревизия 1`));
      const result = await solveAndApprove();
      primary = await queue();
      assert('queue stores exact approved feasible snapshot', primary.status === 'scheduled' && primary.progressSec === 0 && primary.document.id === expectedDocumentId && primary.inputHash === result.inputHash && primary.approval.planHash === primary.planHash && primary.candidate.status === 'feasible_model');
      await openBoard(); await capture('02-approved-queue');
      assert('scheduled start is enabled', await card(primary.id).getByRole('button', { name: 'Начать модельное выполнение', exact: true }).isEnabled());
    });
    await group('3. Explicit start, checkpoint and pause derive dynamic vehicle state', async () => {
      await card(primary.id).getByRole('button', { name: 'Начать модельное выполнение', exact: true }).click();
      await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'Скорость симуляции', exact: true }).selectOption('40');
      await waitRun(primary.id, (r) => r.status === 'running' && r.progressSec > 0, 'first persisted checkpoint');
      primary = await pausePlayback(primary.id);
      assert('pause preserves positive bounded progress', primary.progressSec > 0 && primary.progressSec < primary.candidate.metrics.makespanSec);
      await openBoard();
      await card(primary.id).getByText(/БВС и доступность в этом снимке/).click();
      assert('dynamic states are explicitly model-only', (await card(primary.id).innerText()).includes('Модельное время') && (await card(primary.id).innerText()).includes('расчёт, не измерение'));
      await capture('03-paused-vehicle-availability'); await close();
    });
    await group('4. Slider preview does not rewind stored history, resume uses checkpoint', async () => {
      const before = primary.progressSec;
      const slider = page.getByRole('slider', { name: 'Время симуляции', exact: true });
      await slider.focus(); await slider.press('Home');
      assert('slider previews start', Number(await slider.inputValue()) === 0);
      assert('preview does not rewrite saved progress', (await readRuns()).find((r) => r.id === primary.id).progressSec === before);
      await page.getByRole('button', { name: 'Начать симуляцию', exact: true }).click();
      const resumed = await waitRun(primary.id, (r) => r.status === 'running' && r.progressSec > before, 'resume continues saved checkpoint');
      // Exercise the UI pause-write/resume race: do not wait for persisted paused.
      // Playwright still waits for the actual enabled button; no state injection.
      await page.getByRole('button', { name: 'Пауза', exact: true }).click();
      await page.getByRole('button', { name: 'Начать симуляцию', exact: true }).click();
      const rapid = await waitRun(primary.id, (r) => r.status === 'running' && r.progressSec > resumed.progressSec, 'rapid pause/resume remains monotonic');
      assert('rapid UI pause/resume joins checkpoint without duplication', rapid.revision > resumed.revision && (await readRuns()).length === 1);
      primary = await pausePlayback(primary.id);
      assert('no duplicate run on resume', (await readRuns()).length === 1 && primary.progressSec > before);
    });
    await group('5. Reload paused run, reopen exact snapshot without recalculation', async () => {
      const progress = primary.progressSec, count = requests.length;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Мои миссии', exact: true }).waitFor();
      await openBoard();
      const stored = (await readRuns()).find((r) => r.id === primary.id);
      assert('paused status/time durable after reload', stored.status === 'paused' && stored.progressSec === progress);
      await card(primary.id).getByRole('button', { name: 'Открыть снимок', exact: true }).click();
      await page.getByRole('button', { name: 'План подтверждён', exact: true }).waitFor();
      // HTML range value serialization rounds IEEE-754 decimal tails. Storage
      // comparisons remain exact; only the displayed slider allows 10 ns.
      const sliderProgress = Number(await page.getByRole('slider', { name: 'Время симуляции', exact: true }).inputValue());
      await page.locator('.mission-map[data-map-ready="true"]').waitFor();
      // The real map uses Leaflet preferCanvas, not SVG path elements.
      const canvas = page.locator('.leaflet-overlay-pane canvas').first();
      await canvas.waitFor({ state: 'visible' });
      const drawing = await canvas.evaluate((element) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let painted = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
        return { width: element.width, height: element.height, painted };
      });
      assert('snapshot restores map and candidate with no solve', requests.length === count && Math.abs(sliderProgress - progress) < 1e-8 && drawing.painted > 0, JSON.stringify({ stored: progress, displayed: sliderProgress, requests: requests.length, beforeRequests: count, drawing }));
      await capture('04-restored-snapshot');
    });
    await group('6. Overlapping queued vehicle/time blocks start; cancel preserves row', async () => {
      await importMission('automatic-tradeoff'); await solveAndApprove(); duplicate = await queue();
      assert('second approved snapshot is distinct run', duplicate.id !== primary.id && duplicate.status === 'scheduled');
      await openBoard();
      assert('conflict blocks both run choices', await card(primary.id).getByRole('button', { name: 'Возобновить модель', exact: true }).isDisabled() && await card(duplicate.id).getByRole('button', { name: 'Начать модельное выполнение', exact: true }).isDisabled());
      assert('conflict reason names shared vehicle', (await card(primary.id).innerText()).includes('пересечение модельного окна'));
      await capture('05-conflict-blocked');
      await card(duplicate.id).getByRole('button', { name: 'Отменить выполнение', exact: true }).click();
      duplicate = await waitRun(duplicate.id, (r) => r.status === 'cancelled', 'explicit cancel');
      assert('cancel keeps both snapshots', (await readRuns()).length === 2 && duplicate.finishedAt !== null);
      await card(primary.id).getByRole('button', { name: 'Возобновить модель', exact: true }).waitFor();
      await card(primary.id).getByRole('button', { name: 'Возобновить модель', exact: true }).click({ trial: true });
      assert('remaining run can resume', await card(primary.id).getByRole('button', { name: 'Возобновить модель', exact: true }).isEnabled());
    });
    await group('7. Resume to exact completion, terminal snapshot survives reload and preview', async () => {
      await card(primary.id).getByRole('button', { name: 'Возобновить модель', exact: true }).click();
      await page.getByRole('combobox', { name: 'Скорость симуляции', exact: true }).selectOption('300');
      primary = await waitRun(primary.id, (r) => r.status === 'completed', 'completion', 20000);
      assert('completion records exact duration and terminal timestamp', primary.progressSec === primary.candidate.metrics.makespanSec && primary.finishedAt !== null);
      await openBoard(); await capture('06-completed-board'); await close();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Мои миссии', exact: true }).waitFor(); await openBoard();
      await card(primary.id).getByRole('button', { name: 'Открыть снимок', exact: true }).click();
      const slider = page.getByRole('slider', { name: 'Время симуляции', exact: true });
      await slider.focus(); await slider.press('Home');
      const reloaded = (await readRuns()).find((r) => r.id === primary.id);
      assert('terminal history is immutable under preview', reloaded.status === 'completed' && reloaded.progressSec === primary.progressSec && reloaded.revision === primary.revision);
    });
    await group('8. Reload running checkpoint never advances automatically; explicit recovery pause', async () => {
      await importMission('height-obstacle'); await solveAndApprove();
      await page.getByRole('combobox', { name: 'Скорость симуляции', exact: true }).selectOption('1');
      const ids = new Set((await readRuns()).map((r) => r.id));
      await page.getByRole('button', { name: 'Начать симуляцию', exact: true }).click();
      const until = Date.now() + 15000;
      while (Date.now() < until) {
        orphan = (await readRuns()).find((r) => !ids.has(r.id) && r.status === 'running' && r.progressSec > 0);
        if (orphan) break; await page.waitForTimeout(150);
      }
      assert('start button can enqueue and start once', !!orphan && (await readRuns()).length === 3);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Мои миссии', exact: true }).waitFor();
      const first = (await readRuns()).find((r) => r.id === orphan.id);
      await page.waitForTimeout(500);
      const second = (await readRuns()).find((r) => r.id === orphan.id);
      assert('real elapsed time does not progress orphan record', first.status === 'running' && second.progressSec === first.progressSec && second.revision === first.revision);
      await openBoard();
      assert('orphan checkpoint caveat is visible', (await card(orphan.id).innerText()).includes('Непрерывность выполнения'));
      await card(orphan.id).getByRole('button', { name: 'Зафиксировать паузу', exact: true }).click();
      orphan = await waitRun(orphan.id, (r) => r.status === 'paused', 'orphan recovery pause');
      assert('recovery does not invent elapsed time', orphan.progressSec === first.progressSec);
      await card(orphan.id).getByRole('button', { name: 'Отменить выполнение', exact: true }).click();
      await waitRun(orphan.id, (r) => r.status === 'cancelled', 'orphan cancellation');
      await capture('07-persistence-recovery');
    });
    await group('9. Mobile board, bounded history and no page errors', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert('mobile no document overflow', layout.scrollWidth <= layout.width, JSON.stringify(layout));
      await capture('08-mobile-board');
      assert('history has completed and cancelled records without hidden deletion', (await readRuns()).length === 3 && (await readRuns()).filter((r) => r.status === 'completed').length === 1);
      assert('zero page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
      await close(); await page.setViewportSize({ width: 1440, height: 960 });
    });
  } catch (error) {
    failure = error.message;
    if (groups.at(-1)?.status === 'running') groups.at(-1).status = 'fail';
    await capture('failure');
  } finally {
    page.off('pageerror', onError); page.off('request', onRequest); page.off('dialog', onDialog);
  }
  const report = { checkedAt: new Date().toISOString(), base, session: 'operations-ux-030-proof', status: failure ? 'fail' : 'pass', checks, groups, failure, pageErrors, requests, snapshots, operations: await readRuns(), limitations: ['Only explicit model simulation; no contact, real telemetry, real-flight clearance or real-time scheduling.', 'Checkpoint persistence is not a real flight log. Read-only storage inspection verifies UI effects; all writes used actual controls.', 'A new isolated QA profile is required. No user profile or database is cleared by this script.'] };
  // Native confirmation/beforeunload can make CLI return before this function
  // finishes. Retain test evidence on the Node Playwright Page transport object,
  // NOT in DOM, React state or application storage. A follow-up run-code can
  // retrieve page.__primeOperationsQAReport without repeating UI mutations.
  page.__primeOperationsQAReport = report;
  return report;
}
