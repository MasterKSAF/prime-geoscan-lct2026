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
  const nav = (name) =>
    page
      .getByRole('tablist', { name: 'Разделы стенда' })
      .getByRole('tab', { name, exact: true });
  const reset = async (accept) => {
    await page
      .getByRole('button', { name: 'Настройки и справка', exact: true })
      .click();
    await page.evaluate((accepted) => {
      window.confirm = (message) => {
        window.resetConfirmation = message;
        return accepted;
      };
    }, accept);
    await page
      .getByRole('button', { name: 'Начать с нуля', exact: true })
      .click();
    check(
      'Сброс требует подтверждения и объясняет последствия',
      await page.evaluate(() =>
        window.resetConfirmation.includes('Скачанные файлы сохранятся'),
      ),
    );
    if (accept)
      await page.locator('.demo-mission-cards article').first().waitFor();
    else
      await page
        .getByRole('dialog', { name: 'Настройки и справка' })
        .getByRole('button', { name: 'Закрыть окно', exact: true })
        .click();
  };
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
    const r = await pending;
    check('Расчёт возвращает HTTP 200', r.ok(), r.status());
    await page
      .getByRole('heading', { name: 'Выберите подходящий план' })
      .waitFor();
    return r.json();
  };
  try {
    await reset(true);
    check(
      'После сброса только три карточки',
      (await page.locator('.demo-mission-cards article').count()) === 3,
    );
    check(
      'Редактор и выполнение на чистом старте закрыты',
      (await nav('Редактор').isDisabled()) &&
        (await nav('Выполнение').isDisabled()),
    );
    await nav('Парк БВС').click();
    check(
      'Общий парк: 12 аппаратов, три модели',
      (await page.locator('.demo-fleet h1').innerText()).includes('12') &&
        (await page.locator('.demo-fleet-table tbody tr').count()) === 3,
    );
    check(
      'Все модели доступны для назначения',
      (await page.locator('.demo-availability-badge.available').count()) === 3,
    );
    await page
      .getByRole('row')
      .filter({
        has: page.getByRole('heading', { name: 'Геоскан Gemini', exact: true }),
      })
      .getByRole('button', { name: 'Доступность', exact: true })
      .click();
    check(
      'Pollux доступен на двух аппаратах',
      (await page
        .getByRole('checkbox', {
          name: 'Доступен: north-gemini-ms-1',
          exact: true,
        })
        .isChecked()) &&
        (await page
          .getByRole('checkbox', {
            name: 'Доступен: north-gemini-ms-2',
            exact: true,
          })
          .isChecked()),
    );
    await page.screenshot({ path: 'output/playwright/0.3.5-common-fleet.png' });
    await page
      .getByRole('button', { name: 'Закрыть парк', exact: true })
      .click();
    await open('demo-01-survey');
    await page.getByRole('button', { name: 'Виды работ', exact: true }).click();
    await page
      .getByRole('checkbox', { name: 'Мультиспектр', exact: true })
      .check();
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    const result = await solve();
    check(
      'Demo 1 + MS: все работы выполнены в модели',
      result.document.jobs.length === 2 &&
        result.candidates.every(
          (c) =>
            c.status === 'feasible_model' &&
            c.jobCoverage.every((x) => x.coveragePct >= 99) &&
            c.checks.every((x) => x.status !== 'fail'),
        ),
    );
    check(
      'RGB + MS назначены подходящим БВС',
      result.candidates.every((c) =>
        c.sorties.every((s) =>
          result.document.scenario.vehicles
            .find((v) => v.id === s.vehicleId)
            .jobs.includes(
              result.document.jobs.find((j) => j.id === s.jobId).job.type,
            ),
        ),
      ),
    );
    check(
      'Время и налёт дают действительно разные маршруты',
      result.candidates[0].metrics.makespanSec !==
        result.candidates[1].metrics.makespanSec,
    );
    const map = await page.locator('.mw-map-wrap').boundingBox(),
      panel = await page.locator('.mw-inspector:visible').boundingBox();
    check('Карта остаётся справа от вариантов', map.x > panel.x);
    await page.screenshot({ path: 'output/playwright/0.3.5-rgb-ms-plans.png' });
    await reset(false);
    check(
      'Отмена сброса сохраняет рассчитанные варианты',
      (await page.locator('[data-candidate-id]').count()) > 0,
    );
    await nav('Отчёт').click();
    const first = page.locator('.demo-reports tbody tr').first();
    check(
      'В отчёте есть отдельный столбец проверок',
      await page
        .getByRole('columnheader', { name: 'Проверки плана', exact: true })
        .isVisible(),
    );
    check(
      'Сразу после расчёта нет ложной пометки изменения',
      !(await first.innerText()).includes('Миссия изменена после расчёта'),
    );
    await first.getByRole('button', { name: /^Все проверки:/ }).click();
    check(
      'Проверки открываются прямо из отчёта',
      await page
        .getByRole('heading', {
          name: 'Все обязательные проверки пройдены',
          exact: true,
        })
        .isVisible(),
    );
    check(
      'Сложные разделы анализа скрыты',
      (await page.locator('.mi-section:visible').count()) === 0,
    );
    await open('demo-01-survey');
    await page
      .getByRole('textbox', { name: 'Название миссии', exact: true })
      .fill('Демо 1 · Проверка сохранения результата');
    await nav('Отчёт').click();
    check(
      'Изменение черновика не удаляет старые проверки',
      (await first
        .getByRole('button', { name: /^Все проверки:/ })
        .isEnabled()) &&
        (await first.innerText()).includes('Миссия изменена после расчёта'),
    );
    const dl = page.waitForEvent('download');
    await first
      .getByRole('button', { name: /^Скачать проверки плана:/ })
      .click();
    await (await dl).saveAs('output/playwright/0.3.5-rgb-ms-checks.json');
    check('Сохранённые проверки скачиваются после изменения черновика', true);
    await page.screenshot({ path: 'output/playwright/0.3.5-report.png' });
    await open('demo-02-expert-obstacles');
    const second = await solve();
    check(
      'Demo 2: планы прошли проверки препятствий и разделения',
      second.candidates.every(
        (c) =>
          c.status === 'feasible_model' &&
          ['EXTERNAL_OBSTACLES', 'SEPARATION', 'FOUR_DIMENSIONAL'].every((id) =>
            c.checks.some((x) => x.id === id && x.status === 'pass'),
          ),
      ),
    );
    await nav('Отчёт').click();
    await first.getByRole('button', { name: /^Все проверки:/ }).click();
    check(
      'На анализе показано имя снимка первой миссии',
      await page
        .getByText('Демо 1 · Фотосъёмка квадрата', { exact: true })
        .isVisible(),
    );
    await open('demo-03-repair');
    const third = await solve();
    check(
      'Demo 3: не выполняемый план не разрешён к старту',
      third.candidates.every((c) => c.status !== 'feasible_model') &&
        (await page
          .getByRole('button', { name: 'Проверить и подтвердить', exact: true })
          .isDisabled()),
    );
    await nav('Отчёт').click();
    await page
      .locator('.demo-reports tbody tr')
      .nth(2)
      .getByRole('button', { name: /^Все проверки:/ })
      .click();
    check(
      'Непройденные проверки сразу раскрыты',
      (await page.locator('.mission-failure-detail:visible').count()) ===
        third.candidates[0].checks.filter((x) => x.status === 'fail').length,
    );
    check(
      'Вариант исправления открыт без лишних вкладок',
      await page.locator('.mi-repairs[open]').isVisible(),
    );
    await page.screenshot({
      path: 'output/playwright/0.3.5-failed-checks.png',
    });
    check('Браузер без необработанных ошибок', errors.length === 0, errors);
  } catch (error) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(error) });
    await page.screenshot({ path: 'output/playwright/0.3.5-error.png' });
  }
  return { checks, errors };
}
