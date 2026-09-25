/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name);
  };
  page.on('pageerror', e => errors.push(e.message));
  const nav = name => page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  const back = page.getByRole('button', { name: 'Назад', exact: true });
  const theme = async value => {
    await page.getByRole('button', { name: 'Настройки и справка', exact: true }).click();
    await page.getByRole('combobox', { name: 'Тема интерфейса' }).selectOption(value);
    await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await theme('light');
    const logo = page.getByRole('img', { name: 'Planner', exact: true });
    await logo.evaluate(el => el.decode());
    check('Исходный PNG загружен без изменения пропорций', await logo.evaluate(el => el.naturalWidth === 2048 && el.naturalHeight === 768 && Math.abs(el.clientWidth / el.clientHeight - 8 / 3) < 0.01));
    check('Яркость логотипа увеличена стилем', await logo.evaluate(el => getComputedStyle(el).filter === 'brightness(1.6)'));
    const brand = page.getByRole('button', { name: 'Планер — список миссий', exact: true });
    check('У логотипа нет рамки и подложки', await brand.evaluate(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(el).borderTopWidth === '0px'));
    await brand.hover();
    check('При наведении подложка не появляется', await brand.evaluate(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(el).borderTopWidth === '0px'));
    const bounds = await page.evaluate(() => ({ header: document.querySelector('.mw-appbar').getBoundingClientRect().bottom, back: document.querySelector('.mw-back').getBoundingClientRect().top }));
    check('Назад находится ниже верхней панели', bounds.back >= bounds.header, bounds);
    check('Назад без яркой заливки в светлой теме', await back.evaluate(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)'));
    await page.screenshot({ path: 'output/playwright/brand37-light.png' });
    await nav('Парк БВС').click();
    await back.click();
    check('Назад возвращает к миссиям', await nav('Миссии').getAttribute('aria-selected') === 'true');
    await nav('Отчёт').click();
    await page.getByRole('button', { name: 'Планер — список миссий', exact: true }).click();
    check('Логотип открывает список миссий', await nav('Миссии').getAttribute('aria-selected') === 'true');
    await theme('dark');
    check('Тёмная тема применяется', await page.locator('html').getAttribute('data-prime-theme') === 'dark');
    await page.screenshot({ path: 'output/playwright/brand37-dark.png' });
    await page.getByRole('region', { name: 'Три сценария проверки' }).getByRole('button', { name: 'Редактировать', exact: true }).first().click();
    await page.getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
    await page.locator('.mission-map[data-map-ready=true]').waitFor();
    check('Редактор и карта доступны', await nav('Редактор').getAttribute('aria-selected') === 'true' && await page.locator('.mw-map-wrap').isVisible());
    check('Карта помещается по высоте после переноса Назад', await page.locator('.mw-map-wrap').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
    await page.screenshot({ path: 'output/playwright/brand37-editor.png' });
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`Нет горизонтального переполнения ${width}px`, overflow <= 1, overflow);
      check(`Логотип и Назад доступны ${width}px`, await logo.isVisible() && await back.isVisible());
      if (width === 1024) check('Карта помещается при переносе верхних кнопок на вторую строку', await page.locator('.mw-map-wrap').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
      await page.screenshot({ path: `output/playwright/brand37-editor-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    check('Нет ошибок JavaScript', errors.length === 0, errors);
  } catch (e) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(e) });
    await page.screenshot({ path: 'output/playwright/brand37-error.png' });
  }
  return { checks, errors };
}
