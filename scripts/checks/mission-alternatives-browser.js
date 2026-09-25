/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass) => { checks.push({name, pass: !!pass}); if (!pass) throw Error(name); };
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.confirm = () => true; });
  await page.setViewportSize({width: 1440, height: 900});
  const nav = name => page.getByRole('tablist', {name: 'Разделы стенда'}).getByRole('tab', {name, exact: true});
  const openAndSolve = async id => {
    await nav('Миссии').click();
    await page.locator(`[data-scenario-id="${id}"]`).getByRole('button', {name: 'Редактировать', exact: true}).click();
    await page.getByRole('button', {name: 'Открыть в редакторе', exact: true}).click();
    const pending = page.waitForResponse(r => /\/api\/planner\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000});
    await page.getByRole('button', {name: 'Рассчитать варианты', exact: true}).click();
    const response = await pending;
    check(id + ' — HTTP 200', response.status() === 200);
    await page.getByRole('heading', {name: 'Выберите подходящий план', exact: true}).waitFor();
    return response.json();
  };
  try {
    await page.evaluate(() => { window.confirm = () => true; });
    await page.locator('.demo-mission-cards article').first().waitFor();
    const result = await openAndSolve('demo-01-survey');
    const cards = page.locator('[data-candidate-id]');
    check('три явных варианта', await cards.count() === 3);
    const fast = result.candidates.find(c => c.objective === 'makespan');
    const economy = result.candidates.find(c => c.objective === 'flightTime');
    check('быстрый план действительно быстрее', fast.metrics.makespanSec < economy.metrics.makespanSec);
    check('экономный план действительно уменьшает налёт', economy.metrics.flightTimeSec < fast.metrics.flightTimeSec);
    check('карточка показывает группу и модель', (await cards.first().innerText()).includes('3 одновременно') && (await cards.first().innerText()).includes('Геоскан Gemini × 3'));
    const lastBox = await cards.last().boundingBox();
    check('все три карточки помещаются по высоте 900 px', lastBox.y + lastBox.height < 900);
    const map = await page.locator('.mw-map-wrap').boundingBox();
    const panel = await page.locator('.mw-inspector:visible').boundingBox();
    check('карта справа, сравнение слева', map.x > panel.x);
    await page.screenshot({path: 'output/playwright/alternatives-three-plans.png'});
    await page.locator(`[data-candidate-id="${economy.id}"]`).getByRole('button', {name: /^Меньше налёт/}).click();
    check('экономный вариант выбирается', await page.locator(`[data-candidate-id="${economy.id}"] .mw-plan-select`).getAttribute('aria-pressed') === 'true');
    check('карта переключилась на один аппарат', await page.getByRole('button', {name: /^На карте:/}).count() === 1);
    await page.locator('[data-candidate-id="balanced"]').getByRole('button', {name: /^Баланс/}).click();
    check('баланс выбирается и отображает два аппарата', await page.getByRole('button', {name: /^На карте:/}).count() === 2);
    await page.getByRole('button', {name: 'Проверить и подтвердить', exact: true}).click();
    await page.getByRole('dialog', {name: 'Подтвердить модельный план'}).getByRole('checkbox').check();
    await page.getByRole('button', {name: 'Подтвердить для симуляции', exact: true}).click();
    await page.getByRole('button', {name: 'К выполнению', exact: true}).click();
    await page.getByRole('combobox', {name: 'Скорость симуляции', exact: true}).selectOption('100');
    await page.getByRole('button', {name: 'Выполнить миссию', exact: true}).click();
    await page.getByRole('region', {name: 'Модельная симуляция'}).getByText('Идёт симуляция', {exact: true}).waitFor({timeout:15000});
    check('выбранный баланс запущен', await page.getByRole('button', {name: /^На карте:/}).count() === 2);
    await page.getByRole('region', {name: 'Модельная симуляция'}).getByText('Миссия завершена', {exact: true}).waitFor({timeout:60000});
    check('баланс завершён', true);
    await nav('Отчёт').click();
    const download = page.waitForEvent('download');
    await page.locator('.demo-reports tbody tr').first().getByRole('button', {name: /^Скачать доказательства:/}).click();
    await (await download).saveAs('output/playwright/alternatives-balanced-evidence.zip');
    check('доказательства выбранного баланса выгружаются', true);
    await openAndSolve('demo-02-expert-obstacles');
    const secondCount = await cards.count();
    check('во втором примере от одного до трёх реальных вариантов', secondCount > 0 && secondCount <= 3);
    check('сокращение числа вариантов объяснено', secondCount === 3 || await page.locator('.mw-alternative-reason').isVisible());
    await openAndSolve('demo-03-repair');
    check('при невозможности баланс не выдуман', await page.locator('[data-candidate-id="balanced"]').getAttribute('aria-disabled') === 'true');
    check('невыполнимый вариант нельзя запустить', await page.getByRole('button', {name: 'Проверить и подтвердить', exact: true}).isDisabled());
    check('нет ошибок браузера', errors.length === 0);
  } catch (error) {
    checks.push({name: 'Unexpected error', pass: false, message: String(error)});
    await page.screenshot({path:'output/playwright/alternatives-error.png'});
  }
  return {checks, errors};
}
