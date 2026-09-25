/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [],
    errors = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name + ': ' + (detail ?? ''));
  };
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const blocked = page.url().includes('blocked');
  const suffix = blocked ? 'blocked' : 'returned';
  try {
    if (await page.locator('.demo-mission-cards article').first().isVisible()) {
      await page
        .locator('[data-scenario-id="demo-01-survey"]')
        .getByRole('button', { name: 'Редактировать', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Открыть в редакторе', exact: true })
        .click();
    }
    if (!blocked) {
      await page
        .getByRole('button', { name: 'Виды работ', exact: true })
        .click();
      await page
        .getByRole('checkbox', { name: 'Мультиспектр', exact: true })
        .check();
      await page.getByRole('button', { name: 'Готово', exact: true }).click();
    }
    const pending = page.waitForResponse(
      (r) =>
        r.url().endsWith('/missions/solve') && r.request().method() === 'POST',
      { timeout: 60000 },
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const response = await pending,
      data = await response.json();
    check('Расчёт без ошибок', response.ok());
    check(
      'Полный план проходит проверки',
      data.candidates[0].status === 'feasible_model',
    );
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
      .selectOption('40');
    await page
      .getByRole('button', { name: 'Выполнить миссию', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('input[aria-label="Время симуляции"]')?.value,
        ) > 125,
      null,
      { timeout: 30000 },
    );
    check(
      'Предпусковая проверка и первые 125 секунд без ложной остановки',
      !(await page.locator('.mw-safety-heading').isVisible()),
    );
    await page
      .getByRole('combobox', { name: 'Скорость симуляции', exact: true })
      .selectOption('1');
    await page.locator('.mw-safety-console summary').first().click();
    await page
      .getByRole('combobox', { name: 'Событие', exact: true })
      .selectOption('wind');
    await page
      .getByRole('spinbutton', { name: 'Ветер события', exact: true })
      .fill(blocked ? '20' : '4');
    await page
      .getByRole('button', { name: 'Внести событие', exact: true })
      .click();
    if (blocked) {
      await page
        .locator('.mw-safety-heading')
        .getByText('Безопасный возврат не найден', { exact: true })
        .waitFor({ timeout: 20000 });
      check(
        'Ветер выше предела не превращается в фиктивный возврат',
        (
          await page
            .getByRole('region', { name: 'Защитный контур' })
            .innerText()
        ).includes('превышает предел'),
      );
    } else {
      await page
        .getByRole('combobox', { name: 'Скорость возврата', exact: true })
        .waitFor({ timeout: 20000 });
      await page
        .getByRole('combobox', { name: 'Скорость возврата', exact: true })
        .selectOption('300');
      await page
        .locator('.mw-safety-heading')
        .getByText('Возврат завершён', { exact: true })
        .waitFor({ timeout: 45000 });
      check('Группа вернулась и приземлилась после усиления ветра', true);
    }
    const downloading = page.waitForEvent('download', { timeout: 30000 });
    await page
      .getByRole('button', { name: 'Диагностика ZIP', exact: true })
      .click();
    const download = await downloading;
    check(
      'Одна кнопка выгружает incident.zip',
      download.suggestedFilename().endsWith('.incident.zip'),
    );
    await download.saveAs(`output/playwright/0.3.6-${suffix}.incident.zip`);
    await page.screenshot({ path: `output/playwright/0.3.6-${suffix}.png` });
    await page
      .getByRole('tablist', { name: 'Разделы стенда' })
      .getByRole('tab', { name: 'Отчёт', exact: true })
      .click();
    check(
      'Интерфейс остаётся отзывчивым после события',
      await page
        .getByRole('heading', { name: 'Отчёты миссий', exact: true })
        .isVisible(),
    );
    check('Нет ошибок JavaScript', errors.length === 0, errors);
  } catch (e) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(e) });
    await page.screenshot({
      path: `output/playwright/0.3.6-${suffix}-error.png`,
    });
  }
  return { checks, errors };
}
