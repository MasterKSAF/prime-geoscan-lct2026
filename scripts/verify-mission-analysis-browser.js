async (page) => {
  const out = 'output/playwright/mission-analysis';
  const checks = [],
    errors = [];
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name + ': ' + detail);
  };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept().catch(() => {}));
  const capture = (name) =>
    page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const saveDownload = async (name, click) => {
    const pending = page.waitForEvent('download');
    await click();
    await (await pending).saveAs(`${out}/${name}`);
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (
      await page
        .getByRole('button', { name: 'Заменить текущее задание', exact: true })
        .isVisible()
    )
      await page
        .getByRole('button', { name: 'Заменить текущее задание', exact: true })
        .click();
    else {
      await page
        .locator('input[type=file][accept=".json,.yaml,.yml"]')
        .setInputFiles(
          'public/planner/scenarios/automatic-tradeoff.mission.json',
        );
      await page
        .getByRole('button', { name: 'Заменить текущее задание', exact: true })
        .click();
    }
    const solved = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/planner/missions/solve') &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const response = await solved,
      result = await response.json();
    check(
      'selected example is fully feasible',
      response.ok() && result.candidates[0].status === 'feasible_model',
    );
    await page.getByRole('tab', { name: 'Результаты', exact: true }).click();
    await page.getByRole('tab', { name: 'Анализ', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Анализ решения' });
    await panel.waitFor();
    check(
      'analysis defaults to collapsed sections',
      (await panel.locator('details[open]').count()) === 0,
    );
    await panel.getByText('Назначение каждого БВС', { exact: true }).click();
    check(
      'assignments visible with actual battery',
      (await panel.innerText()).includes('Заряд 100%'),
    );
    await panel.getByText('Назначение каждого БВС', { exact: true }).click();
    await panel.getByText('Запас устойчивости', { exact: true }).click();
    const analyzed = page.waitForResponse((r) =>
      r.url().endsWith('/api/planner/missions/analyze'),
    );
    await panel
      .getByRole('button', { name: 'Проверить устойчивость', exact: true })
      .click();
    const stressResponse = await analyzed,
      report = await stressResponse.json();
    check(
      'stress API accepts actual selected candidate',
      stressResponse.ok(),
      JSON.stringify(report).slice(0, 300),
    );
    check('stress checks all four requested cases', report.cases.length === 4);
    check(
      'stress binds same original input',
      report.inputHash === result.inputHash &&
        report.baseline.status === 'verified',
    );
    await panel
      .getByRole('button', { name: 'Отчёт устойчивости', exact: true })
      .waitFor();
    await saveDownload('robustness.json', () =>
      panel
        .getByRole('button', { name: 'Отчёт устойчивости', exact: true })
        .click(),
    );
    await capture('stress');
    await panel.getByText('Запас устойчивости', { exact: true }).click();
    await panel
      .getByText('Нужны ли все назначенные БВС', { exact: true })
      .click();
    const trialResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/planner/missions/solve') &&
        r.request().method() === 'POST',
    );
    await panel
      .getByRole('button', { name: 'Проверить вариант', exact: true })
      .first()
      .click();
    const trial = await trialResponse,
      alternate = await trial.json();
    check(
      'counterfactual did not mutate original input',
      alternate.inputHash !== result.inputHash,
    );
    check(
      'excluded UAV is retained physically',
      alternate.document.scenario.vehicles.length ===
        result.document.scenario.vehicles.length &&
        alternate.document.scenario.vehicles.some((v) => !v.enabled),
    );
    await panel
      .getByRole('button', { name: 'Скачать сравнение', exact: true })
      .first()
      .waitFor();
    await saveDownload('counterfactual.json', () =>
      panel
        .getByRole('button', { name: 'Скачать сравнение', exact: true })
        .first()
        .click(),
    );
    await saveDownload('counterfactual.evidence.json', () =>
      panel
        .getByRole('button', { name: 'Доказательства варианта', exact: true })
        .first()
        .click(),
    );
    await panel
      .getByText('Нужны ли все назначенные БВС', { exact: true })
      .click();
    await panel
      .getByText('Покрытие и ожидаемый результат съёмки', { exact: true })
      .click();
    await panel
      .getByRole('button', { name: 'Показать покрытие', exact: true })
      .click();
    check(
      'coverage renders every job',
      (await panel.locator('.mi-coverage-card svg').count()) ===
        result.document.jobs.length,
    );
    check(
      'coverage preserves explicit unknowns',
      (await panel.innerText()).includes('неподтверждённые параметры качества'),
    );
    await saveDownload('coverage.geojson', () =>
      panel
        .getByRole('button', { name: 'Скачать слой GeoJSON', exact: true })
        .click(),
    );
    await capture('coverage');
    await page.setViewportSize({ width: 390, height: 844 });
    check(
      'mobile has no horizontal overflow',
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await capture('mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: 'Редактор', exact: true }).click();
    await page.getByRole('tab', { name: 'Результаты', exact: true }).click();
    await page.getByRole('tab', { name: 'Анализ', exact: true }).click();
    check(
      'analysis remount has no stale stress report',
      (await panel
        .getByRole('button', { name: 'Отчёт устойчивости', exact: true })
        .count()) === 0,
    );
    check(
      'no unhandled browser errors',
      errors.length === 0,
      errors.join('\n'),
    );
  } catch (e) {
    checks.push({ name: 'fatal', pass: false, detail: String(e) });
    await capture('failure');
  }
  const report = {
    at: new Date().toISOString(),
    browser: await page.evaluate(() => navigator.userAgent),
    checks,
    errors,
  };
  page.__analysisReport = report;
  await saveDownload('browser-report.json', () =>
    page.evaluate((value) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: 'application/json',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'browser-report.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, report),
  );
  return report;
}
