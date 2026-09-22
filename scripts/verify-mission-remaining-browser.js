async (page) => {
  const out = 'output/playwright/mission-analysis',
    checks = [],
    errors = [];
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name + ': ' + detail);
  };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept().catch(() => {}));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator('input[type=file][accept=".json,.yaml,.yml"]')
      .setInputFiles('public/planner/scenarios/area-with-hole.mission.json');
    await page
      .getByRole('button', { name: 'Заменить текущее задание', exact: true })
      .click();
    const pending = page.waitForResponse((r) =>
      r.url().endsWith('/api/planner/missions/solve'),
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const result = await (await pending).json(),
      candidate = result.candidates[0];
    check('source mission is feasible', candidate.status === 'feasible_model');
    await page
      .getByRole('button', { name: 'Проверить и подтвердить', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Подтвердить/ })
      .click();
    await page
      .getByRole('button', { name: 'К выполнению', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Скорость симуляции' })
      .selectOption('100');
    await page
      .locator('.mw-playback')
      .getByRole('button', { name: 'Начать симуляцию', exact: true })
      .click();
    const second = candidate.sorties[0].segments.filter(
      (s) => s.phase === 'survey',
    )[1];
    await page.waitForFunction(
      (target) =>
        Number(
          document.querySelector('input[aria-label="Время симуляции"]')?.value,
        ) >= target,
      (second.startSec + second.endSec) / 2,
      { timeout: 20000 },
    );
    await page
      .getByRole('combobox', { name: 'Скорость симуляции' })
      .selectOption('1');
    await page.locator('.mw-safety-console summary').first().click();
    await page
      .getByRole('combobox', { name: 'Событие', exact: true })
      .selectOption('wind');
    await page.getByRole('spinbutton', { name: 'Ветер события' }).fill('0');
    await page
      .getByRole('button', { name: 'Внести событие', exact: true })
      .click();
    await page.locator('.mw-safety-heading').waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.includes('Вернуться на свои базы') && !button.disabled,
      ),
    );
    check(
      'checked recovery is offered',
      await page
        .getByRole('button', { name: /Вернуться на свои базы/ })
        .isEnabled(),
    );
    await page.getByRole('button', { name: /Вернуться на свои базы/ }).click();
    await page
      .getByRole('combobox', { name: 'Скорость возврата', exact: true })
      .selectOption('300');
    await page
      .getByRole('button', { name: 'Закрыть выполнение', exact: true })
      .waitFor({ timeout: 20000 });
    await page
      .getByRole('button', { name: 'Закрыть выполнение', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Результаты', exact: true }).click();
    await page.getByRole('tab', { name: 'Анализ', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Анализ решения' });
    await panel
      .getByText('Продолжить оставшиеся участки после возврата', {
        exact: true,
      })
      .click();
    check(
      'remaining draft requires explicit data acknowledgement',
      !(await panel
        .getByRole('button', {
          name: 'Подготовить оставшиеся участки',
          exact: true,
        })
        .isEnabled()),
    );
    await panel
      .getByRole('checkbox', {
        name: 'Подтверждаю получение пригодных данных завершённых проходов до события',
        exact: true,
      })
      .check();
    await panel
      .getByRole('button', {
        name: 'Подготовить оставшиеся участки',
        exact: true,
      })
      .click();
    await panel
      .getByRole('button', { name: 'Открыть остаток в редакторе', exact: true })
      .waitFor({ timeout: 20000 });
    check(
      'separate remainder draft is offered',
      (await panel.innerText()).includes('Новое задание:'),
    );
    const download = page.waitForEvent('download');
    await panel
      .getByRole('button', { name: 'Скачать обоснование остатка', exact: true })
      .click();
    await (await download).saveAs(`${out}/remaining-work.json`);
    await page.screenshot({
      path: `${out}/remaining-work.png`,
      fullPage: true,
    });
    await panel
      .getByRole('button', { name: 'Открыть остаток в редакторе', exact: true })
      .click();
    check(
      'remainder opens through preview, not immediate execution',
      await page
        .getByRole('button', { name: 'Заменить текущее задание', exact: true })
        .isVisible(),
    );
    await page
      .getByRole('button', { name: 'Заменить текущее задание', exact: true })
      .click();
    check(
      'new draft enters editor',
      (await page
        .getByRole('tab', { name: 'Редактор', exact: true })
        .getAttribute('aria-selected')) === 'true',
    );
    check(
      'no unhandled remainder-flow errors',
      errors.length === 0,
      errors.join('\n'),
    );
  } catch (e) {
    checks.push({ name: 'fatal', pass: false, detail: String(e) });
    await page.screenshot({
      path: `${out}/remaining-failure.png`,
      fullPage: true,
    });
  }
  const report = { at: new Date().toISOString(), checks, errors };
  const download = page.waitForEvent('download');
  await page.evaluate((report) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remaining-browser-report.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, report);
  await (await download).saveAs(`${out}/remaining-browser-report.json`);
  return report;
}
