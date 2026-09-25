/* oxlint-disable no-unused-expressions -- Executed as a Playwright CLI callback. */
async (page) => {
  const prefix = page.url().includes(':3016/')
    ? 'editor-20260924-prod'
    : 'editor-20260924-dev';
  const checks = [],
    errors = [],
    calculations = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(`${name}: ${JSON.stringify(detail)}`);
  };
  const nav = (name) =>
    page
      .getByRole('tablist', { name: 'Разделы стенда' })
      .getByRole('tab', { name, exact: true });
  const openDemo = async (i) => {
    await nav('Миссии').click();
    await page
      .getByRole('region', { name: 'Три сценария проверки' })
      .getByRole('button', { name: 'Редактировать', exact: true })
      .nth(i)
      .click();
    await page
      .getByRole('dialog', { name: 'Проверка перед загрузкой' })
      .getByRole('button', { name: 'Открыть в редакторе', exact: true })
      .click();
  };
  const errorsListener = (error) => errors.push(error.message);
  const consoleListener = (message) => {
    if (message.type() === 'error') errors.push(message.text());
  };
  const dialogListener = dialog => dialog.accept();
  page.on('dialog', dialogListener);
  page.on('pageerror', errorsListener);
  page.on('console', consoleListener);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(page.url());
    await page.getByRole('region', { name: 'Три сценария проверки' }).waitFor();
    await openDemo(0);
    const sections = page.locator('.me-section');
    check(
      'Three editor sections, all collapsed on load',
      (await sections.count()) === 3 &&
        (await page.locator('.me-section[open]').count()) === 0,
    );
    const sizes = await sections.evaluateAll((nodes) =>
      nodes.map((node) => {
        const summary = node.querySelector('summary'),
          bounds = summary.getBoundingClientRect(),
          style = getComputedStyle(summary);
        return {
          x: bounds.x,
          width: bounds.width,
          height: bounds.height,
          font: style.fontSize,
          weight: style.fontWeight,
        };
      }),
    );
    check(
      'Same heading width, height, font and alignment',
      sizes.every((s) => JSON.stringify(s) === JSON.stringify(sizes[0])),
      sizes,
    );
    check(
      'No obsolete catalog subtitle',
      !(
        await page.locator('.mission-data-panel > summary').innerText()
      ).includes('каталогов'),
    );
    for (const label of [
      'Выполняемые работы',
      'Общие правила миссии',
      'Данные миссии',
    ]) {
      const hint = page.getByRole('button', {
        name: `Пояснение: ${label}`,
        exact: true,
      });
      await hint.click();
      check(
        `Help opens without expanding section: ${label}`,
        (await hint.getAttribute('aria-expanded')) === 'true' &&
          (await page.locator('.me-section[open]').count()) === 0,
      );
      await page.keyboard.press('Escape');
    }
    const controls = await page
      .locator('.mw-editor-top-tabs')
      .evaluate((node) => {
        const buttons = [...node.querySelectorAll('button')],
          logo = document.querySelector('.mw-brand').getBoundingClientRect(),
          tabs = document
            .querySelector('.mw-workspace-tabs')
            .getBoundingClientRect();
        return {
          labels: buttons.map((b) => b.textContent.trim()),
          gap:
            buttons[1].getBoundingClientRect().left -
            buttons[0].getBoundingClientRect().right,
          navigationGap: tabs.left - logo.right,
        };
      });
    check(
      'One calculation action immediately beside Mission',
      controls.labels.join('|') === 'Миссия|Рассчитать варианты' &&
        controls.gap >= 4 &&
        controls.gap < 20,
      controls,
    );
    check(
      'Desktop navigation shifted right',
      controls.navigationGap >= 72 && controls.navigationGap <= 105,
      controls,
    );
    await page.screenshot({
      path: `output/playwright/${prefix}-collapsed.png`,
    });

    await page.locator('.me-works > summary').click();
    check(
      'Work editor still opens',
      await page
        .getByRole('combobox', { name: 'Выбранная работа', exact: true })
        .isVisible(),
    );
    await openDemo(0);
    check(
      'Reopening the same mission collapses work editor',
      (await page.locator('.me-section[open]').count()) === 0,
    );
    await page
      .getByRole('textbox', { name: 'Название миссии', exact: true })
      .fill('Проверка JSON · текущие изменения');
    await page.locator('.mission-data-panel > summary').click();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Скачать данные миссии JSON', exact: true })
      .click();
    const download = await downloadPromise;
    await download.saveAs(`output/playwright/${prefix}-edited.mission.json`);
    check(
      'Full JSON download has mission extension',
      download.suggestedFilename() === 'demo-01-survey.mission.json',
      download.suggestedFilename(),
    );
    check(
      'All three KML imports remain available',
      (await page
        .getByRole('button', { name: /^(Участки|Зоны|Препятствия) KML$/ })
        .count()) === 3,
    );

    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      check(
        `No horizontal overflow at ${width}px`,
        layout.scroll <= width,
        layout,
      );
      check(
        `Calculation action visible at ${width}px`,
        await page
          .getByRole('button', { name: 'Рассчитать варианты', exact: true })
          .isVisible(),
      );
      await page.screenshot({
        path: `output/playwright/${prefix}-${width}.png`,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (let i = 0; i < 3; i++) {
      await openDemo(i);
      check(
        `Demo ${i + 1}: collapsed on load`,
        (await page.locator('.me-section[open]').count()) === 0,
      );
      if (i === 1) {
        await page.locator('.mission-data-panel > summary').click();
        const pendingDownload = page.waitForEvent('download');
        await page
          .getByRole('button', {
            name: 'Скачать данные миссии JSON',
            exact: true,
          })
          .click();
        await (
          await pendingDownload
        ).saveAs(`output/playwright/${prefix}-obstacles.mission.json`);
      }
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      let requestCount = 0;
      const route = async (request) => {
        requestCount++;
        await gate;
        await request.continue();
      };
      await page.route('**/missions/solve*', route);
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().includes('/missions/solve') &&
          r.request().method() === 'POST',
        { timeout: 60000 },
      );
      await page
        .getByRole('button', { name: 'Рассчитать варианты', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'Выберите подходящий план', exact: true })
        .waitFor();
      check(
        `Demo ${i + 1}: immediate plans view with busy state`,
        (await page.locator('.mw-inspector [aria-busy="true"]').isVisible()) &&
          (await page
            .getByRole('button', { name: 'Расчёт…', exact: true })
            .isDisabled()),
      );
      check(
        `Demo ${i + 1}: no preliminary screen`,
        (await page
          .getByText('Миссия готова к расчёту', { exact: true })
          .count()) === 0 &&
          (await page
            .getByRole('button', { name: 'Рассчитать миссию', exact: true })
            .count()) === 0,
      );
      release();
      const response = await responsePromise,
        result = await response.json();
      await page
        .getByRole('button', { name: 'Проверить и подтвердить', exact: true })
        .waitFor();
      check(
        `Demo ${i + 1}: exactly one request`,
        requestCount === 1,
        requestCount,
      );
      check(
        `Demo ${i + 1}: expected calculation outcome`,
        response.ok() &&
          result.candidates.every((c) =>
            i < 2
              ? c.status === 'feasible_model'
              : c.status !== 'feasible_model',
          ),
      );
      calculations.push({
        id: result.document.id,
        status: response.status(),
        candidates: result.candidates.map((c) => ({
          id: c.id,
          status: c.status,
        })),
      });
      await page.unroute('**/missions/solve*', route);
      if (i === 0)
        await page.screenshot({
          path: `output/playwright/${prefix}-plans.png`,
        });
    }
    check('No browser errors', errors.length === 0, errors);
  } finally {
    page.off('pageerror', errorsListener);
    page.off('console', consoleListener);
    page.off('dialog', dialogListener);
  }
  return {
    passed: checks.filter((c) => c.pass).length,
    checks,
    errors,
    calculations,
  };
}
