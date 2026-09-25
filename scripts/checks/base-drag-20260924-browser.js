/* oxlint-disable no-unused-expressions -- Executed as a Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass, detail) => { checks.push({name, pass:!!pass, detail}); if (!pass) throw Error(`${name}: ${JSON.stringify(detail)}`); };
  const button = (name) => page.getByRole('button', {name, exact:true});
  const nav = (name) => page.getByRole('tablist', {name:'Разделы стенда'}).getByRole('tab', {name,exact:true});
  const read = async () => {
    const promise = page.waitForEvent('download');
    await button('Скачать данные миссии JSON').click();
    const stream = await (await promise).createReadStream(); stream.setEncoding('utf8');
    let text = ''; for await (const chunk of stream) text += chunk;
    return JSON.parse(text);
  };
  const open = async (i) => {
    await nav('Миссии').click();
    await page.getByRole('region', {name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).nth(i).click();
    await button('Открыть в редакторе').click();
    await button('Объекты карты').click();
  };
  const drag = async (marker, dx, dy) => {
    const box = await marker.boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width/2 + dx, box.y + box.height/2 + dy, {steps:15});
    await page.mouse.up();
  };
  const err = (e) => errors.push(e.message); page.on('pageerror', err);
  const dialogs = (d) => d.accept(); page.on('dialog', dialogs);
  try {
    await page.setViewportSize({width:1440,height:960});
    if (await page.getByRole('dialog').count()) await button('Закрыть окно').click();
    await button('Настройки и справка').click();
    await page.evaluate(()=>{window.__baseTestConfirm=window.confirm;window.confirm=()=>true;});
    await button('Начать с нуля').click();
    await page.evaluate(()=>{window.confirm=window.__baseTestConfirm;delete window.__baseTestConfirm;});
    await open(0);
    const original = await read(), first = {
      id: await page.locator('.mission-base-icon').first().getAttribute('data-base-id'),
      name: await page.locator('.mission-base-icon').first().getAttribute('title'),
      coordinate: original.scenario.vehicles[0].start,
    };
    const marker = () => page.locator(`[data-base-id="${first.id}"]`);
    await marker().click();
    check('Base click opens compact card', await page.getByRole('textbox',{name:'Название базы',exact:true}).inputValue() === first.name);
    check('Coordinates and assignments hidden by default', !(await page.getByRole('spinbutton',{name:'Долгота базы'}).isVisible()) && !(await page.getByRole('region',{name:'Назначение БВС'}).count()));
    if (await button('Close popup').count()) await button('Close popup').click();
    await drag(marker(), -65, -45);
    await button('Отменить изменение базы').waitFor();
    const moved = await read(), relocated = moved.bases.find((b)=>b.id===first.id);
    check('Real mouse drag commits coordinates without Save', JSON.stringify(relocated.coordinate) !== JSON.stringify(first.coordinate));
    check('Drag keeps battery and same aircraft', JSON.stringify(moved.batteries) === JSON.stringify(original.batteries) && JSON.stringify(moved.scenario.vehicles.map(v=>v.id)) === JSON.stringify(original.scenario.vehicles.map(v=>v.id)));
    check('Selected marker remains on the map', await marker().isVisible() && await marker().evaluate(el=>el.classList.contains('is-selected')));
    await button('Отменить изменение базы').click();
    await page.getByRole('status').filter({hasText:'Изменение базы отменено.'}).waitFor();
    const undone = await read();
    check('Undo restores original endpoints and bases', JSON.stringify(undone.bases) === JSON.stringify(original.bases) && JSON.stringify(undone.scenario.vehicles) === JSON.stringify(original.scenario.vehicles));
    await button('Закрыть сообщение базы').click();
    await marker().click({button:'right'});
    await button('Перенести').click();
    const box = await marker().boundingBox();
    await page.mouse.click(box.x - 60, box.y - 45);
    await button('Отменить изменение базы').waitFor();
    check('Move then map click applies without hidden Save', JSON.stringify((await read()).bases.find(b=>b.id===first.id).coordinate) !== JSON.stringify(first.coordinate));
    await button('Отменить изменение базы').click();
    await page.getByRole('status').filter({hasText:'Изменение базы отменено.'}).waitFor();
    await button('Закрыть сообщение базы').click();
    await marker().click();
    if (await button('Close popup').count()) await button('Close popup').click();
    await page.locator('.base-editor-coordinates summary').click();
    await page.getByRole('spinbutton',{name:'Долгота базы'}).fill('0');
    await page.getByRole('spinbutton',{name:'Широта базы'}).fill('0');
    await button('Сохранить изменения').click();
    check('Invalid coordinates produce clear error and preserve map', (await page.getByRole('region',{name:'Объекты карты',exact:true}).getByRole('alert').innerText()).includes('вне границы') && JSON.stringify((await read()).bases) === JSON.stringify(original.bases));
    await button('Закрыть настройки базы').click();
    await marker().click({button:'right'});
    await page.locator('.mission-base-popup-actions').getByRole('button',{name:'Удалить',exact:true}).click();
    check('Occupied base cannot be removed without destination', await button('Подтвердить удаление').isDisabled());
    await page.getByRole('combobox',{name:'База для переназначения'}).selectOption({index:1});
    await button('Подтвердить удаление').click();
    await page.getByRole('textbox',{name:'Название базы',exact:true}).waitFor({state:'hidden'});
    const deleted = await read();
    check('Deletion removes real marker and base, no Start ghost', !deleted.bases.some(b=>b.id===first.id) && await marker().count() === 0 && !(await page.getByRole('region',{name:'Карта полётной миссии',exact:true}).innerText()).includes('Старт Геоскан'));
    check('Deletion preserves all aircraft and charge', deleted.scenario.vehicles.length === original.scenario.vehicles.length && JSON.stringify(deleted.batteries) === JSON.stringify(original.batteries));
    await button('Отменить изменение базы').click();
    await page.getByRole('status').filter({hasText:'Изменение базы отменено.'}).waitFor();
    await button('Закрыть сообщение базы').click();
    await button('Добавить базу').click();
    await page.getByRole('textbox',{name:'Название базы',exact:true}).fill('Пустая резервная база');
    await page.locator('.base-editor-coordinates summary').click();
    await page.getByRole('spinbutton',{name:'Долгота базы'}).fill('30.300');
    await page.getByRole('spinbutton',{name:'Широта базы'}).fill('60.034');
    await button('Создать базу').click();
    await page.getByRole('textbox',{name:'Название базы',exact:true}).waitFor({state:'hidden'});
    const added = await read(), empty = added.bases.find(b=>b.name==='Пустая резервная база');
    check('Empty base can be created without assigning aircraft', !!empty && JSON.stringify(added.scenario.vehicles) === JSON.stringify(original.scenario.vehicles));
    await button('Закрыть сообщение базы').click();
    await page.locator(`[data-base-id="${empty.id}"]`).click({button:'right'});
    await page.locator('.mission-base-popup-actions').getByRole('button',{name:'Удалить',exact:true}).click();
    check('Empty base deletion needs no destination', await button('Подтвердить удаление').isEnabled() && !(await page.getByRole('combobox',{name:'База для переназначения'}).count()));
    await button('Подтвердить удаление').click();
    await page.getByRole('textbox',{name:'Название базы',exact:true}).waitFor({state:'hidden'});
    check('Empty base deletion preserves other bases', !(await read()).bases.some(b=>b.id===empty.id) && (await page.locator('.mission-base-icon').count()) === original.scenario.vehicles.length);
    await button('Закрыть сообщение базы').click();
    await marker().click();
    if (await button('Close popup').count()) await button('Close popup').click();
    await button('Изменить БВС').click();
    const assigned = page.getByRole('region',{name:'Назначение БВС'}).getByRole('checkbox',{checked:true});
    check('Assigned UAV can be reassigned, not a disabled checkbox', await assigned.first().isEnabled());
    await assigned.first().uncheck();
    check('Removing assignment requires a safe destination', await button('Сохранить изменения').isDisabled());
    await page.getByRole('combobox',{name:'База для переназначения'}).selectOption({index:1});
    await button('Сохранить изменения').click();
    await page.getByRole('textbox',{name:'Название базы',exact:true}).waitFor({state:'hidden'});
    const unassigned = await read();
    check('Base can be left empty; aircraft remains in fleet', unassigned.bases.some(b=>b.id===first.id) && !unassigned.scenario.vehicles.some(v=>JSON.stringify(v.start)===JSON.stringify(first.coordinate)) && unassigned.scenario.vehicles.length===original.scenario.vehicles.length);
    await button('Отменить изменение базы').click();
    await page.getByRole('status').filter({hasText:'Изменение базы отменено.'}).waitFor();
    await button('Закрыть сообщение базы').click();
    await open(1);
    check('Catalog source controls are collapsed', await page.locator('.catalog-source').count() > 0 && !(await button('Отключить каталог').first().isVisible()));
    await page.locator('.mission-catalog-imports > summary').click();
    check('Expert catalogs reveal sources and controls together', await button('Отключить каталог').first().isVisible() && await button('Загрузить участки KML').isVisible());
    await page.locator('.mission-catalog-imports > summary').click();
    await page.locator('.mission-base-icon').first().click();
    if (await button('Close popup').count()) await button('Close popup').click();
    for (const theme of ['dark','light']) {
      await button('Настройки и справка').click();
      await page.getByRole('combobox',{name:'Тема интерфейса'}).selectOption(theme);
      await button('Закрыть окно').click();
      const size=await page.locator('.base-editor').boundingBox();
      const heading=await page.locator('.base-editor-heading').boundingBox();
      check(`Compact base card and inline name in ${theme}`, size.height < 230 && heading.height < 45, {card:size.height,heading:heading.height});
      await page.screenshot({path:`output/playwright/base-drag-20260924-${theme}.png`});
    }
    await button('Развернуть карту').click();
    await page.locator('.mission-base-icon').first().click({button:'right'});
    await page.locator('.mission-base-popup-actions').getByRole('button',{name:'Удалить',exact:true}).click();
    check('Delete from focused map reveals its confirmation panel', await page.getByRole('region',{name:'Удаление базы'}).isVisible() && await button('Развернуть карту').isVisible());
    await button('Отмена').click();
    await page.setViewportSize({width:900,height:900});
    check('Narrow display has no horizontal page overflow', await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({width:1440,height:960});
    check('No runtime errors', errors.length === 0, errors);
  } finally {
    await page.evaluate(report=>{window.__baseDragReport=report;},{passed:checks.filter(c=>c.pass).length,checks,errors});
    page.off('pageerror',err);
    page.off('dialog',dialogs);
  }
  return {passed:checks.length,checks,errors};
}
