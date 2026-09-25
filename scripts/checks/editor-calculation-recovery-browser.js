/* oxlint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  await page.unroute('**/missions/solve*');
  const checks = [];
  const check = (name, pass) => { checks.push({ name, pass: !!pass }); if (!pass) throw Error(name); };
  await page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name: 'Миссии', exact: true }).click();
  await page.getByRole('region', { name: 'Три сценария проверки' }).getByRole('button', { name: 'Редактировать', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Проверка перед загрузкой' }).getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { arrived = resolve; });
  const heldRoute = async route => {
    arrived();
    await gate;
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    } catch (error) {
      if (!String(error).includes('Route is already handled')) throw error;
    }
  };
  await page.route('**/missions/solve*', heldRoute);
  await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
  await started;
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  check('Cancelled calculation re-enables action', await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).isEnabled());
  release();
  await page.unroute('**/missions/solve*', heldRoute);
  check('Cancelled result is not displayed', await page.locator('.mw-plan-card:visible').count() === 0);

  const failure = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Контрольная ошибка сервиса' }) });
  await page.route('**/missions/solve*', failure);
  await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
  await page.locator('.mw-calculation-state').filter({ hasText: 'Контрольная ошибка сервиса' }).waitFor();
  check('Failure exposes the cause and permits retry', await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).isEnabled());
  check('Failed calculation leaves no stale plan', await page.locator('.mw-plan-card:visible').count() === 0);
  await page.unroute('**/missions/solve*', failure);

  const response = page.waitForResponse(r => r.url().includes('/missions/solve') && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
  const result = await (await response).json();
  await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).waitFor();
  check('Real calculation works after cancellation and failure', result.candidates.every(c => c.status === 'feasible_model'));
  return { passed: checks.length, checks };
}
