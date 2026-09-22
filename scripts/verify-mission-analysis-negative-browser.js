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
    await page
      .locator('input[type=file][accept=".json,.yaml,.yml"]')
      .setInputFiles('public/planner/scenarios/wind-limit.mission.json');
    await page
      .getByRole('button', { name: 'Заменить текущее задание', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Результаты', exact: true }).click();
    await page.getByRole('tab', { name: 'Анализ', exact: true }).click();
    check(
      'new input hides old analysis',
      (await page.getByRole('region', { name: 'Анализ решения' }).count()) ===
        0,
    );
    await page.getByRole('tab', { name: 'Редактор', exact: true }).click();
    const pending = page.waitForResponse((r) =>
      r.url().endsWith('/api/planner/missions/solve'),
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const result = await (await pending).json();
    check(
      'strong wind is rejected',
      result.candidates.every((c) => c.status !== 'feasible_model'),
    );
    await page.getByRole('tab', { name: 'Результаты', exact: true }).click();
    await page.getByRole('tab', { name: 'Анализ', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Анализ решения' });
    const repairSection = panel.locator('.mi-section').filter({
      has: page.getByText('Что изменить, чтобы выполнить задание', { exact: true }),
    });
    if (!(await repairSection.getAttribute('open')) && !(await repairSection.evaluate(el => el.open)))
      await repairSection.locator('summary').first().click();
    const extra = panel
      .locator('article')
      .filter({
        has: page.getByRole('heading', {
          name: 'Проверить дополнительные 30 минут',
          exact: true,
        }),
      });
    const attempt = page.waitForResponse((r) =>
      r.url().endsWith('/api/planner/missions/solve'),
    );
    await extra
      .getByRole('button', { name: 'Проверить вариант', exact: true })
      .click();
    const revised = await (await attempt).json();
    check(
      'repair does not weaken wind limits',
      revised.document.scenario.wind.speedMps ===
        result.document.scenario.wind.speedMps,
    );
    check(
      'failed repair never claims success',
      revised.candidates.every((c) => c.status !== 'feasible_model'),
    );
    await extra.getByText(/Полный допустимый план не найден/).waitFor();
    check(
      'failed repair cannot be opened as a validated alternative',
      (await extra
        .getByRole('button', { name: 'Открыть копию задания', exact: true })
        .count()) === 0,
    );
    await panel.getByText('Запас устойчивости', { exact: true }).click();
    const stressed = page.waitForResponse((r) =>
      r.url().endsWith('/api/planner/missions/analyze'),
    );
    await panel
      .getByRole('button', { name: 'Проверить устойчивость', exact: true })
      .click();
    const stress = await (await stressed).json();
    check(
      'invalid baseline cannot produce green stress',
      stress.cases.every((c) => c.status === 'not_checked'),
    );
    check(
      'reasons for skipped stress visible',
      (await panel.innerText()).includes('полный допустимый исходный план'),
    );
    await page.screenshot({ path: `${out}/negative.png`, fullPage: true });
    check(
      'no unhandled negative-flow errors',
      errors.length === 0,
      errors.join('\n'),
    );
  } catch (e) {
    checks.push({ name: 'fatal', pass: false, detail: String(e) });
  }
  const report = { at: new Date().toISOString(), checks, errors };
  const pending = page.waitForEvent('download');
  await page.evaluate((report) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'negative-browser-report.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, report);
  await (await pending).saveAs(`${out}/negative-browser-report.json`);
  return report;
}
