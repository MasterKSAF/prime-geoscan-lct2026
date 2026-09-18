// eslint-disable-next-line no-unused-expressions -- Playwright CLI evaluates this function and supplies page.
async (page) => {
  // Run through Playwright CLI, not node directly:
  // npx --yes --package @playwright/cli playwright-cli -s=mission-v2-docker run-code --filename scripts/verify-mission-browser.js --raw
  // Uses the real Docker API; no mocked responses or direct React-state mutation.
  const base = 'http://127.0.0.1:3016';
  // Launch Playwright CLI from the repository root so artifacts and fixtures resolve locally.
  // Rechecks must not overwrite the archived 0.3.0 evidence.
  const out = 'output/playwright/recheck-core';
  const checks = [];
  const pageErrors = [];
  const downloads = [];
  const onError = (error) => pageErrors.push(error.message);
  const onDialog = (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
  };
  const assert = (name, condition, detail = '') => {
    checks.push({ name, pass: Boolean(condition), detail });
    if (!condition) throw new Error(`QA failed: ${name}. ${detail}`);
  };
  const downloadFrom = async (button, filename) => {
    const pending = page.waitForEvent('download');
    await button.click();
    const file = await pending;
    const path = `${out}/${filename}`;
    await file.saveAs(path);
    assert(`download ${filename}`, (await file.failure()) === null, path);
    downloads.push({ path, suggestedFilename: file.suggestedFilename() });
    return path;
  };
  const calculate = async () => {
    const pending = page.waitForResponse(
      (response) =>
        response.url() === `${base}/api/planner/missions/solve` &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const response = await pending;
    assert(
      'real solve HTTP 200',
      response.status() === 200,
      `HTTP ${response.status()}`,
    );
    return {
      input: response.request().postDataJSON(),
      result: await response.json(),
    };
  };
  page.on('pageerror', onError);
  page.on('dialog', onDialog);
  try {
    const healthResponse = await page.request.get(`${base}/api/planner/health`);
    const health = await healthResponse.json();
    assert(
      'Docker mission engine 0.3.0',
      healthResponse.status() === 200 &&
        health.missionEngineVersion === '0.3.0' &&
        health.missionSchemaVersion === '2.0',
      JSON.stringify(health),
    );
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/planner`, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .waitFor();
    assert(
      'simulation initially blocked',
      await page
        .getByRole('button', { name: 'Начать симуляцию', exact: true })
        .isDisabled(),
    );
    const first = await calculate();
    assert(
      'two candidates on same input',
      first.result.candidates.length === 2 &&
        first.result.candidates.every(
          (c) => c.plan.inputHash === first.result.inputHash,
        ),
    );
    const candidate =
      first.result.candidates.find(
        (c) => c.objective === first.input.scenario.objective,
      ) ?? first.result.candidates[0];
    assert(
      'default 1 km² feasible',
      candidate.status === 'feasible_model' &&
        !candidate.checks.some((c) => c.status === 'fail'),
      candidate.status,
    );
    assert(
      'repeat sorties and battery change',
      candidate.metrics.sortieCount >= 3 &&
        candidate.metrics.batteryChanges >= 1,
    );
    await page
      .getByRole('button', { name: 'Проверить и подтвердить', exact: true })
      .click();
    const approvalDialog = page.getByRole('dialog', {
      name: 'Подтвердить модельный план',
      exact: true,
    });
    const approveButton = approvalDialog.getByRole('button', {
      name: 'Подтвердить для симуляции',
      exact: true,
    });
    assert(
      'explicit assumptions acknowledgement required',
      await approveButton.isDisabled(),
    );
    await approvalDialog.getByRole('checkbox').check();
    await approveButton.click();
    await page
      .getByRole('button', { name: 'План подтверждён', exact: true })
      .waitFor();
    assert(
      'confirmed simulation enabled',
      await page
        .getByRole('button', { name: 'Начать симуляцию', exact: true })
        .isEnabled(),
    );
    await downloadFrom(
      page.getByRole('button', { name: 'Доказательства', exact: true }),
      'mission-v2-docker-evidence.json',
    );
    await downloadFrom(
      page.getByRole('button', { name: 'Задание YAML', exact: true }),
      'mission-v2-docker-task.mission.yaml',
    );
    await page.screenshot({
      path: `${out}/mission-v2-docker-desktop.png`,
      fullPage: true,
    });
    await page
      .getByRole('combobox', { name: 'Скорость симуляции', exact: true })
      .selectOption('300');
    await page
      .getByRole('button', { name: 'Начать симуляцию', exact: true })
      .click();
    await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Начать симуляцию', exact: true })
      .waitFor({ timeout: 45000 });
    assert(
      'simulation reaches complete state',
      (await page
        .getByRole('heading', { name: /БВС:.*Работы завершены/ })
        .count()) === 1,
    );
    assert(
      'journal contains actual planned battery change',
      (await page.getByText('Замена АКБ', { exact: true }).count()) >= 1,
    );
    const simulationTime = await page.locator('.mw-playback-time').innerText();
    const times = simulationTime.split('/').map((v) => v.trim());
    assert(
      'simulation ends at plan duration',
      times.length === 2 && times[0] === times[1],
      simulationTime,
    );
    await page.screenshot({
      path: `${out}/mission-v2-docker-simulation.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Изменить задание', exact: true })
      .click();
    await page
      .getByRole('button', { name: '2. Территория', exact: true })
      .click();
    // Set the genuine geometry file input directly. Opening a native chooser inside
    // run-code leaves Playwright CLI's modal cache pending even after setFiles.
    await page
      .getByLabel('Файл координатного слоя', { exact: true })
      .setInputFiles('public/planner/scenarios/area-with-hole.area.geojson');
    const geometryDialog = page.getByRole('dialog', {
      name: 'Импорт координатного слоя',
      exact: true,
    });
    await geometryDialog.waitFor();
    assert(
      'geometry preview preserves hole',
      (await geometryDialog.getByText(/2 контуров/).count()) === 1,
    );
    const desktopDialog = await geometryDialog.boundingBox();
    assert(
      'desktop dialog centered',
      !!desktopDialog &&
        Math.abs(desktopDialog.x + desktopDialog.width / 2 - 720) < 2 &&
        Math.abs(desktopDialog.y + desktopDialog.height / 2 - 480) < 2,
      JSON.stringify(desktopDialog),
    );
    await page.screenshot({
      path: `${out}/mission-v2-docker-geometry-preview.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDialog = await geometryDialog.boundingBox();
    assert(
      'mobile dialog centered and fits',
      !!mobileDialog &&
        mobileDialog.width <= 390 &&
        Math.abs(mobileDialog.x + mobileDialog.width / 2 - 195) < 2 &&
        Math.abs(mobileDialog.y + mobileDialog.height / 2 - 422) < 2,
      JSON.stringify(mobileDialog),
    );
    await page.screenshot({
      path: `${out}/mission-v2-docker-geometry-preview-mobile.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await geometryDialog
      .getByRole('button', { name: 'Применить весь слой', exact: true })
      .click();
    assert(
      'geometry edit invalidates approval',
      (await page
        .getByRole('button', { name: 'Начать симуляцию', exact: true })
        .isDisabled()) &&
        (await page
          .getByRole('button', { name: 'План JSON', exact: true })
          .isDisabled()),
    );
    const hole = await calculate();
    assert(
      'hole reaches real solver without loss',
      hole.input.jobs[0].area.coordinates.length === 2 &&
        hole.result.document.jobs[0].area.coordinates.length === 2,
    );
    await downloadFrom(
      page.getByRole('button', { name: 'JSON', exact: true }),
      'mission-v2-docker-imported-hole.mission.json',
    );
    await page.getByRole('button', { name: 'Подложка', exact: true }).click();
    assert(
      'offline map toggle exposed',
      (await page
        .getByRole('button', { name: 'Подложка', exact: true })
        .getAttribute('aria-pressed')) === 'false',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `${out}/mission-v2-docker-mobile.png`,
      fullPage: true,
    });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(
      'mobile no horizontal overflow',
      layout.scrollWidth <= layout.width,
      JSON.stringify(layout),
    );
    assert(
      'map decorative flag absent',
      (await page.locator('.leaflet-attribution-flag').count()) === 0,
    );
    assert(
      'zero page errors',
      pageErrors.length === 0,
      JSON.stringify(pageErrors),
    );
    return {
      checkedAt: new Date().toISOString(),
      base,
      health,
      checks,
      pageErrors,
      downloads,
      firstInputHash: first.result.inputHash,
      candidate: {
        status: candidate.status,
        metrics: candidate.metrics,
        checks: candidate.checks.map((c) => ({ id: c.id, status: c.status })),
      },
      importedHoleCandidateStatuses: hole.result.candidates.map(
        (c) => c.status,
      ),
      screenshots: [
        'mission-v2-docker-desktop.png',
        'mission-v2-docker-simulation.png',
        'mission-v2-docker-geometry-preview.png',
        'mission-v2-docker-geometry-preview-mobile.png',
        'mission-v2-docker-mobile.png',
      ],
    };
  } finally {
    page.off('pageerror', onError);
    page.off('dialog', onDialog);
  }
}
