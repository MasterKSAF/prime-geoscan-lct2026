async (page) => {
  const out = 'output/playwright/help-on-demand';
  const checks = [], errors = [];
  let mobileContext = null;
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw new Error(`${name}: ${detail}`);
  };
  const nav = (target, name) => target.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  const quoteA = 'Рассчитаем оба критерия на одном входе.';
  const quoteB = 'Модельная симуляция. Паспортные максимумы';
  const help = (target, name) => target.getByRole('button', { name: `Пояснение: ${name}`, exact: true });
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const tooltip = async (target, trigger) => {
    const id = await trigger.getAttribute('aria-controls');
    check('help trigger is tied to a tooltip ID', !!id);
    return target.locator(`[id=${JSON.stringify(id)}]`);
  };
  const box = async target => {
    const value = await target.locator('.mw-map-wrap').boundingBox();
    check('map remains visible for layout comparison', !!value && value.width > 100 && value.height > 100);
    return value;
  };
  const sameBox = (name, before, after) => check(name, ['x', 'y', 'width', 'height'].every(key => Math.abs(before[key] - after[key]) <= 1), JSON.stringify({ before, after }));
  const inViewport = async (target, popup, name) => {
    const bounds = await popup.boundingBox(), viewport = target.viewportSize();
    check(name, !!bounds && !!viewport && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify({ bounds, viewport }));
  };
  const saveReport = async report => {
    const pending = page.waitForEvent('download');
    await page.evaluate(value => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'browser-report.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, report);
    await (await pending).saveAs(`${out}/browser-report.json`);
  };
  page.on('pageerror', error => errors.push(`desktop: ${error.message}`));
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await nav(page, 'Редактор').click();
    const editor = page.locator('.mw-simple-editor');
    await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 20000 });
    check('priority explanation does not occupy editor before request', !normalize(await editor.innerText()).includes(quoteA));
    check('simulation explanation does not occupy editor before request', !normalize(await editor.innerText()).includes(quoteB));

    await editor.getByRole('button', { name: 'Условия', exact: true }).click();
    const cloudHelp = help(editor, 'Источники облачности и видимости');
    await cloudHelp.scrollIntoViewIfNeeded();
    const cloudPopup = await tooltip(page, cloudHelp), cloudBefore = await box(page);
    check('weather explanation is initially hidden', !await cloudPopup.isVisible());
    await cloudHelp.hover();
    await cloudPopup.waitFor({ state: 'visible' });
    check('weather explanation opens on hover with unknown-data rule', (await cloudPopup.innerText()).includes('неизвестные значения'));
    sameBox('hovering conditions help does not move or shrink the map', cloudBefore, await box(page));
    await page.keyboard.press('Escape');
    await cloudPopup.waitFor({ state: 'hidden' });
    check('Escape closes weather help', !await cloudPopup.isVisible());
    check('terrain limitation remains visible without opening help', (await editor.innerText()).includes('Рельеф: принято допущение плоской поверхности'));

    await editor.getByRole('button', { name: 'Задание', exact: true }).click();
    const priorityHelp = help(editor, 'Как сравниваются приоритеты миссии');
    await priorityHelp.scrollIntoViewIfNeeded();
    const priorityPopup = await tooltip(page, priorityHelp), priorityBefore = await box(page);
    const priorityClosed = !await priorityHelp.evaluate(node => node.closest('details').open);
    check('priority section is collapsed before help', priorityClosed);
    check('priority prose stays hidden even when its header is visible', !normalize(await editor.innerText()).includes(quoteA));
    await priorityHelp.hover();
    await priorityPopup.waitFor({ state: 'visible' });
    check('priority quote appears in requested tooltip', normalize(await priorityPopup.innerText()).includes(quoteA));
    check('hovering help does not expand the priority editor', !await priorityHelp.evaluate(node => node.closest('details').open));
    sameBox('priority tooltip does not change map geometry', priorityBefore, await box(page));
    await inViewport(page, priorityPopup, 'desktop priority tooltip fits the viewport');
    await page.screenshot({ path: `${out}/editor-priority-hover.png` });
    await page.keyboard.press('Escape');
    await priorityPopup.waitFor({ state: 'hidden' });
    await page.mouse.move(4, 4);
    await priorityHelp.focus();
    await priorityPopup.waitFor({ state: 'visible' });
    check('keyboard focus opens priority help', await priorityHelp.getAttribute('aria-expanded') === 'true');
    await page.keyboard.press('Escape');
    await priorityPopup.waitFor({ state: 'hidden' });
    check('Escape closes focused help without expanding its section', !await priorityHelp.evaluate(node => node.closest('details').open));
    await priorityHelp.click();
    await priorityPopup.waitFor({ state: 'visible' });
    await page.mouse.move(4, 4);
    check('click pins priority help after pointer leaves', await priorityPopup.isVisible());
    await priorityHelp.click();
    await priorityPopup.waitFor({ state: 'hidden' });
    check('second click closes pinned help without toggling section', !await priorityHelp.evaluate(node => node.closest('details').open));
    await editor.locator('summary').filter({ hasText: 'Приоритет, высота и качество съёмки' }).click();
    check('both priority choices remain available', await editor.getByRole('button', { name: 'Раньше завершить миссию', exact: true }).isVisible() && await editor.getByRole('button', { name: 'Снизить общий налёт', exact: true }).isVisible());
    check('expanded priority section has no unsolicited criterion paragraph', !normalize(await editor.innerText()).includes(quoteA));

    const summaryHelp = help(editor, 'Перед подтверждением миссии');
    await summaryHelp.scrollIntoViewIfNeeded();
    const summaryPopup = await tooltip(page, summaryHelp), summaryBefore = await box(page);
    check('simulation disclaimer remains hidden before explicit request', !normalize(await editor.innerText()).includes(quoteB));
    await summaryHelp.hover();
    await summaryPopup.waitFor({ state: 'visible' });
    check('simulation disclaimer is preserved in requested summary help', normalize(await summaryPopup.innerText()).includes(quoteB));
    sameBox('summary help does not move the map', summaryBefore, await box(page));
    await page.screenshot({ path: `${out}/editor-summary-hover.png` });
    await page.keyboard.press('Escape');
    await summaryPopup.waitFor({ state: 'hidden' });

    await nav(page, 'Миссии').click();
    await page.getByRole('button', { name: 'Загрузить задание', exact: true }).click();
    const upload = page.getByRole('dialog', { name: 'Загрузить данные', exact: true });
    check('upload uses a native modal dialog', await upload.evaluate(node => node.matches(':modal')));
    check('upload format disclaimer is not a standalone visible paragraph', !normalize(await upload.innerText()).includes('ТЗ не задаёт единый формат входной миссии'));
    const uploadHelp = help(upload, 'Загрузить данные'), uploadPopup = await tooltip(page, uploadHelp);
    await uploadHelp.hover();
    await uploadPopup.waitFor({ state: 'visible' });
    check('modal help enters native popover top layer', await uploadPopup.evaluate(node => node.matches(':popover-open')));
    await inViewport(page, uploadPopup, 'modal help fits viewport without clipping');
    check('modal tooltip is actually on top at its centre', await uploadPopup.evaluate(node => { const bounds = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)); }));
    await page.keyboard.press('Escape');
    await uploadPopup.waitFor({ state: 'hidden' });
    check('Escape closes help but keeps upload modal open', await upload.isVisible() && await upload.evaluate(node => node.matches(':modal')));
    const fileHelp = help(upload, 'Файл задания'), filePopup = await tooltip(page, fileHelp);
    check('JSON and YAML explanation is hidden until requested', !await filePopup.isVisible());
    await fileHelp.click();
    await filePopup.waitFor({ state: 'visible' });
    check('file help explains the supported mission format', normalize(await filePopup.innerText()).includes('JSON / YAML нашего формата'));
    check('all upload actions remain visible', await upload.getByRole('button', { name: 'Выбрать файл задания', exact: true }).isVisible() && await upload.getByRole('button', { name: 'Выбрать файл геометрии', exact: true }).isVisible() && await upload.getByRole('button', { name: 'Выбрать слой ограничений', exact: true }).isVisible());
    await page.screenshot({ path: `${out}/upload-file-help.png` });
    await page.keyboard.press('Escape');
    await filePopup.waitFor({ state: 'hidden' });
    await upload.getByRole('button', { name: 'Закрыть окно', exact: true }).click();

    const browser = page.context().browser();
    check('isolated mobile context is available', !!browser);
    mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', error => errors.push(`mobile: ${error.message}`));
    const origin = await page.evaluate(() => window.location.origin);
    await mobile.goto(`${origin}/planner?v=help-on-demand-mobile`);
    await mobile.getByRole('button', { name: 'Загрузить задание', exact: true }).click();
    const mobileUpload = mobile.getByRole('dialog', { name: 'Загрузить данные', exact: true });
    const mobileHelp = help(mobileUpload, 'Файл задания'), mobilePopup = await tooltip(mobile, mobileHelp);
    await mobileHelp.scrollIntoViewIfNeeded();
    check('mobile help is initially hidden', !await mobilePopup.isVisible());
    const mobileTrigger = await mobileHelp.boundingBox();
    check('mobile touch target is visible', !!mobileTrigger);
    await mobile.touchscreen.tap(mobileTrigger.x + mobileTrigger.width / 2, mobileTrigger.y + mobileTrigger.height / 2);
    await mobilePopup.waitFor({ state: 'visible' });
    check('real touch opens mobile file help', await mobileHelp.getAttribute('aria-expanded') === 'true' && normalize(await mobilePopup.innerText()).includes('JSON / YAML нашего формата'));
    await inViewport(mobile, mobilePopup, 'mobile popover stays inside the narrow viewport');
    await mobile.screenshot({ path: `${out}/mobile-file-help.png`, fullPage: true });
    await mobile.touchscreen.tap(mobileTrigger.x + mobileTrigger.width / 2, mobileTrigger.y + mobileTrigger.height / 2);
    await mobilePopup.waitFor({ state: 'hidden' });
    check('second touch closes mobile help without closing modal', await mobileUpload.isVisible() && !await mobilePopup.isVisible());
    check('no unhandled browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    checks.push({ name: 'fatal', pass: false, detail: String(error) });
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => undefined);
  } finally {
    await mobileContext?.close();
  }
  const report = { at: new Date().toISOString(), source: 'isolated-ui-browser-check', checks, errors, status: checks.every(item => item.pass) ? 'pass' : 'fail' };
  await saveReport(report);
  return report;
}
