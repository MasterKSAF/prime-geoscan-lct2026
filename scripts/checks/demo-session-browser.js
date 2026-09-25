/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const out = 'output/playwright/demo-session',
    checks = [],
    errors = [];
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name + ': ' + detail);
  };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const nav = (n) =>
    page
      .getByRole('tablist', { name: 'Разделы стенда' })
      .getByRole('tab', { name: n, exact: true });
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
        /\/api\/planner\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) &&
        r.request().method() === 'POST',
      { timeout: 30000 },
    );
    await page
      .getByRole('button', { name: 'Рассчитать варианты', exact: true })
      .click();
    const r = await pending;
    check('расчёт HTTP 200', r.status() === 200);
    await page
      .getByRole('heading', { name: 'Выберите подходящий план', exact: true })
      .waitFor();
    return r.json();
  };
  const start = async () => {
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
      .getByText('Идёт симуляция', { exact: true })
      .waitFor({ timeout: 15000 });
  };
  const download = async (button, file) => {
    const pending = page.waitForEvent('download');
    await button.click();
    await (await pending).saveAs(out + '/' + file);
  };
  try {
    await page.addInitScript(()=>{window.confirm=()=>true;});
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(page.url().split('/planner')[0] + '/planner');
    await page.locator('.demo-mission-cards article').first().waitFor();
    check(
      'чистый старт: 3 карточки',
      (await page.locator('.demo-mission-cards article').count()) === 3,
    );
    check(
      'поиск и статистика убраны',
      (await page.getByRole('searchbox').count()) === 0 &&
        (await page
          .locator('.demo-mission-cards')
          .getByRole('button')
          .count()) === 3,
    );
    check(
      'без редактируемой миссии при старте',
      await nav('Редактор').isDisabled(),
    );
    await page.screenshot({ path: out + '/01-missions.png' });
    await nav('Отчёт').click();
    check(
      'таблица 3 пустых отчётов',
      (await page.locator('.demo-reports tbody tr').count()) === 3 &&
        (await page
          .locator('.demo-reports')
          .getByText('Нет расчёта', { exact: true })
          .count()) === 3,
    );
    await nav('Парк БВС').click();
    check(
      'все 3 марки парка',
      (await page.locator('.demo-fleet-row').count()) === 3,
    );
    await page.screenshot({ path: out + '/02-fleet.png' });
    await page
      .locator('.demo-fleet-row')
      .first()
      .getByRole('button', { name: 'Возможности', exact: true })
      .click();
    check(
      'характеристики в диалоге',
      await page
        .getByRole('dialog')
        .getByText('Паспортные пределы:', { exact: false })
        .isVisible(),
    );
    await page.getByRole('button', { name: 'Закрыть парк' }).click();
    await page
      .locator('.demo-fleet-row')
      .first()
      .getByRole('button', { name: 'Доступность', exact: true })
      .click();
    check(
      'доступность по 3 миссиям',
      (await page.getByRole('dialog').getByRole('checkbox').count()) === 3,
    );
    await page.getByRole('button', { name: 'Закрыть парк' }).click();
    await open('demo-01-survey');
    const a = await solve();
    check(
      'первый план выполним',
      a.candidates.some((c) => c.status === 'feasible_model'),
    );
    check(
      'модельная погода',
      a.document.scenario.wind.speedMps === 1 && !a.document.weather,
    );
    const panel = await page
        .locator('.mw-sidebar:visible, .mw-inspector:visible')
        .first()
        .boundingBox(),
      map = await page.locator('.mw-map-wrap').boundingBox();
    check('карта справа от панели', map.x > panel.x);
    check(
      'нет навязчивой фразы',
      !(await page.locator('body').innerText()).includes('Не подтверждено'),
    );
    await start();
    await page.screenshot({ path: out + '/03-execution.png' });
    await page
      .getByRole('region', { name: 'Модельная симуляция' })
      .getByText('Миссия завершена', { exact: true })
      .waitFor({ timeout: 60000 });
    await nav('Отчёт').click();
    const report = page.locator('.demo-reports tbody tr').first();
    check(
      'реальный модельный прогресс 100%',
      await report.getByText('100%', { exact: true }).isVisible(),
    );
    await download(
      report.getByRole('button', { name: /Скачать отчёт/ }),
      'demo-01.report.html',
    );
    await download(
      report.getByRole('button', { name: /Скачать проверки плана/ }),
      'demo-01.checks.json',
    );
    await download(
      report.getByRole('button', { name: /Скачать доказательства/ }),
      'demo-01.evidence.zip',
    );
    await page.screenshot({ path: out + '/04-reports.png' });
    await open('demo-02-expert-obstacles');
    const b = await solve();
    check(
      'KML экспертов и второй план выполним',
      !!b.document.obstacleLayer &&
        b.candidates.some((c) => c.status === 'feasible_model'),
    );
    await start();
    await page
      .getByRole('region', { name: 'Модельная симуляция' })
      .getByText('Миссия завершена', { exact: true })
      .waitFor({ timeout: 60000 });
    await nav('Отчёт').click();
    await download(
      page
        .locator('.demo-reports tbody tr')
        .nth(1)
        .getByRole('button', { name: /Скачать доказательства/ }),
      'demo-02.evidence.zip',
    );
    await open('demo-03-repair');
    const c = await solve();
    check(
      'мок не скрывает дефицит батареи',
      c.candidates.every((x) => x.status !== 'feasible_model'),
    );
    await nav('Отчёт').click();
    await download(
      page
        .locator('.demo-reports tbody tr')
        .nth(2)
        .getByRole('button', { name: /Скачать доказательства/ }),
      'demo-03.evidence.zip',
    );
    await nav('Выполнение').click();
    const remove = page.getByRole('button', {
      name: /Удалить из выполнения: Демо 1/,
    });
    await remove.click();
    await nav('Отчёт').click();
    await page.locator('.demo-reports tbody tr').first().getByText('Нет расчёта',{exact:true}).waitFor();
    check(
      'удалён журнал выбранной миссии',
      await page
        .locator('.demo-reports tbody tr')
        .first()
        .getByText('Нет расчёта', { exact: true })
        .isVisible(),
    );
    check(
      'другая миссия сохранена',
      await page
        .locator('.demo-reports tbody tr')
        .nth(1)
        .getByText('Завершено', { exact: true })
        .isVisible(),
    );
    await nav('Редактор').click();
    await page.getByRole('button',{name:'Миссия',exact:true}).click();
    await page.getByRole('button',{name:'Сохранить',exact:true}).click();
    await page.reload();
    await page.locator('.demo-mission-cards article').first().waitFor();
    check(
      'перезапуск чистый без журналов',
      await nav('Выполнение').isDisabled(),
    );
    await nav('Отчёт').click();
    check(
      'три свежие миссии без истории',
      (await page
        .locator('.demo-reports')
        .getByText('Нет расчёта', { exact: true })
        .count()) === 3,
    );
    check('нет ошибок браузера', errors.length === 0, errors.join('\n'));
  } finally {
    console.log(JSON.stringify({ checks, errors }, null, 2));
    await page.screenshot({ path: out + '/final.png' });
  }
  return {checks,errors};
}
