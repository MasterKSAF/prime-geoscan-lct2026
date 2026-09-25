/* eslint-disable no-unused-expressions -- Playwright CLI regression callback. */
async (page) => {
  const checks = [],
    errors = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name + ': ' + (detail ?? ''));
  };
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.confirm = () => true;
  });
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  const nav = (name) =>
    page
      .getByRole('tablist', { name: 'Разделы стенда' })
      .getByRole('tab', { name, exact: true });
  const open = async (id) => {
    await nav('Миссии').click();
    await page
      .locator(`[data-scenario-id="${id}"]`)
      .getByRole('button', { name: 'Редактировать', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Открыть в редакторе', exact: true })
      .click();
  };
  const solve = async () => {
    const pending = page.waitForResponse(
      (r) =>
        /\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) &&
        r.request().method() === 'POST',
      { timeout: 60000 },
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const response = await pending;
    check(
      'API расчёта: HTTP 200',
      response.status() === 200,
      await response.text().then((t) => (response.ok() ? '' : t.slice(0, 500))),
    );
    await page
      .getByRole('heading', { name: 'Выберите подходящий план' })
      .waitFor();
    return response.json();
  };
  try {
    await nav('Миссии').click();
    await page.locator('.demo-mission-cards article').first().waitFor();
    check(
      'На старте только три предустановленные миссии',
      (await page.locator('.demo-mission-cards article').count()) === 3,
    );
    await nav('Парк БВС').click();
    await nav('Парк БВС').getAttribute('aria-selected');
    check(
      'Парк — таблица с тремя моделями',
      (await page.locator('.demo-fleet table tbody tr').count()) === 3,
    );
    const fleetBox = await page.locator('.demo-fleet').boundingBox();
    check(
      'Шрифт парка увеличен',
      await page
        .locator('.demo-fleet table')
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 15),
    );
    check(
      'Статус доступности заметен',
      await page
        .locator('.demo-availability-badge')
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontWeight) >= 600),
    );
    check(
      'Главные разделы крупнее',
      await nav('Парк БВС').evaluate(
        (e) => parseFloat(getComputedStyle(e).fontSize) >= 17,
      ),
    );
    check(
      'Назад без яркой светлой заливки',
      await page
        .getByRole('button', { name: 'Назад', exact: true })
        .evaluate((e) => getComputedStyle(e).backgroundColor.includes('rgba')),
    );
    await page.screenshot({ path: 'output/playwright/0.3.4-fleet.png' });
    await nav('Отчёт').click();
    const reportBox = await page.locator('.demo-reports').boundingBox();
    check(
      'Ширина парка совпадает с отчётом',
      Math.abs(fleetBox.width - reportBox.width) < 2 &&
        Math.abs(fleetBox.x - reportBox.x) < 2,
      { fleetBox, reportBox },
    );
    check(
      'Отчёт читается крупнее',
      await page
        .locator('.demo-reports table')
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 15),
    );
    check(
      'Таблица отчёта помещается без обрезки',
      await page
        .locator('.demo-reports .demo-table-scroll')
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    check(
      'Возврат с отчёта работает',
      (await nav('Парк БВС').getAttribute('aria-selected')) === 'true',
    );
    await open('demo-02-expert-obstacles');
    await page.locator('.mission-data-panel > summary').click();
    check(
      'В Демо 2 подключены оба новых каталога',
      (await page.locator('.catalog-source').count()) === 2,
    );
    await page
      .getByLabel('Каталог участков KML', { exact: true })
      .setInputFiles(
        'docs/planner/expert-materials/2026-09-23/originals/flight-boundaries.kml',
      );
    await page
      .getByRole('region', { name: 'Предпросмотр каталога' })
      .waitFor({ timeout: 30000 });
    check(
      'Полный каталог 696 участков прочитан',
      (
        await page
          .getByRole('region', { name: 'Предпросмотр каталога' })
          .innerText()
      ).includes('696 объектов'),
    );
    await page
      .getByRole('textbox', { name: 'Поиск в каталоге' })
      .fill('item-205');
    await page.locator('.catalog-list input[type=checkbox]').check();
    await page
      .getByRole('button', { name: 'Применить участки (1)', exact: true })
      .click();
    await page
      .getByLabel('Каталог зон KML', { exact: true })
      .setInputFiles(
        'docs/planner/expert-materials/2026-09-23/originals/moscow-zone.kml',
      );
    await page
      .getByRole('region', { name: 'Предпросмотр каталога' })
      .waitFor({ timeout: 30000 });
    check(
      'Полный каталог 341 зоны прочитан',
      (
        await page
          .getByRole('region', { name: 'Предпросмотр каталога' })
          .innerText()
      ).includes('341 объектов'),
    );
    await page
      .getByRole('button', { name: 'Применить зоны', exact: true })
      .click();
    const result = await solve();
    const candidate = result.candidates.find((c) => c.id === 'makespan');
    check(
      'Новый Демо 2 проходит расчёт',
      candidate.status === 'feasible_model' &&
        !candidate.checks.some((c) => c.status === 'fail'),
    );
    const joint = candidate.sorties.find(
      (s) =>
        new Set(
          s.segments
            .filter((p) => p.phase === 'survey')
            .map((p) => p.jobId ?? s.jobId),
        ).size > 1,
    );
    check(
      'Два участка за один вылет',
      !!joint &&
        joint.segments.filter((s) => s.phase === 'takeoff').length === 1 &&
        joint.segments.filter((s) => s.phase === 'landing').length === 1,
    );
    check(
      'Резерв батареи сохранён',
      candidate.sorties.every(
        (s) => s.remainingPct >= result.document.scenario.reservePct,
      ),
    );
    const count = await page.locator('[data-candidate-id]').count();
    check(
      'Нет искусственных дублей; меньше трёх планов объяснено',
      count > 0 &&
        count <= 3 &&
        (count === 3 ||
          (await page.locator('.mw-alternative-reason').isVisible())),
      count,
    );
    check(
      'Учитываются препятствия и разделение БВС',
      ['EXTERNAL_OBSTACLES', 'SEPARATION', 'FOUR_DIMENSIONAL'].every((id) =>
        candidate.checks.some((c) => c.id === id && c.status === 'pass'),
      ),
    );
    const map = await page.locator('.mw-map-wrap').boundingBox(),
      panel = await page.locator('.mw-inspector:visible').boundingBox();
    check('Карта справа от панели вариантов', map.x > panel.x);
    await page.screenshot({ path: 'output/playwright/0.3.4-demo2-plans.png' });
    await page
      .getByRole('button', { name: 'Проверить и подтвердить', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Подтвердить модельный план' })
      .getByRole('checkbox')
      .check();
    await page
      .getByRole('button', { name: 'Подтвердить для симуляции', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'К выполнению', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Скорость симуляции', exact: true })
      .selectOption('100');
    await page
      .getByRole('button', { name: 'Выполнить миссию', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Модельная симуляция' })
      .getByText('Миссия завершена', { exact: true })
      .waitFor({ timeout: 60000 });
    check('Совместный вылет завершён без ошибки снимка', true);
    await nav('Отчёт').click();
    const row = page.locator('.demo-reports tbody tr').nth(1);
    await row.getByRole('button', { name: /^Скачать видео MP4:/ }).waitFor();
    for (const [name, file] of [
      ['Скачать доказательства:', 'output/playwright/0.3.4-demo2-evidence.zip'],
      ['Скачать видео MP4:', 'output/playwright/0.3.4-demo2.mp4'],
      ['Скачать проверки плана:', 'output/playwright/0.3.4-demo2-checks.json'],
    ]) {
      const download = page.waitForEvent('download', { timeout: 60000 });
      await row.getByRole('button', { name: new RegExp('^' + name) }).click();
      await (await download).saveAs(file);
      check('Выгрузка: ' + file, true);
    }
    await row.getByRole('button', { name: /^Открыть отчёт:/ }).click();
    await page.locator('iframe[title]').last().waitFor();
    await page
      .getByRole('dialog', { name: 'Отчёт миссии' })
      .getByRole('button', { name: '← Назад к отчётам', exact: true })
      .click();
    check(
      'Назад из просмотра отчёта',
      await page.getByRole('heading', { name: 'Отчёты миссий' }).isVisible(),
    );
    await page.screenshot({ path: 'output/playwright/0.3.4-report.png' });
    await open('demo-01-survey');
    await solve();
    check(
      'Первый сценарий сохранил три варианта',
      (await page.locator('[data-candidate-id]').count()) === 3,
    );
    await open('demo-03-repair');
    const third = await solve();
    check(
      'Третий сценарий честно отклонён',
      third.candidates.every((c) => c.status !== 'feasible_model') &&
        (await page
          .getByRole('button', { name: 'Проверить и подтвердить', exact: true })
          .isDisabled()),
    );
    check('Ошибок браузера нет', errors.length === 0, errors);
  } catch (error) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(error) });
    await page.screenshot({ path: 'output/playwright/0.3.4-error.png' });
  }
  return { checks, errors };
}
