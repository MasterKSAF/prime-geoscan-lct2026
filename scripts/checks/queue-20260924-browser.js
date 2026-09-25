/* oxlint-disable no-unused-expressions -- Executed as a Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); if (!pass) throw Error(`${name}: ${JSON.stringify(detail)}`); };
  const nav = (name) => page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  const region = () => page.getByRole('region', { name: 'Миссии и загрузка' });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const download = async (click, filename) => {
    const promise = page.waitForEvent('download'); await click(); const value = await promise;
    if (filename) await value.saveAs(`output/playwright/${filename}`);
    const stream = await value.createReadStream(); stream.setEncoding('utf8');
    let text = ''; for await (const chunk of stream) text += chunk;
    return text;
  };
  const supplyFile = async (label, name, text) => page.getByLabel(label, {exact:true}).evaluate((input, file) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([file.text], file.name, {type:'application/json'}));
    input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
  }, {name,text});
  const importFile = async (doc, raw = false) => {
    await nav('Миссии').click();
    await supplyFile('Файл миссии', 'expert.mission.json', raw ? doc : JSON.stringify(doc));
    if (!raw) await page.getByRole('dialog', {name:'Проверка перед загрузкой'}).waitFor();
  };
  const openCard = async (i = 0) => {
    await nav('Миссии').click();
    await region().getByRole('button', { name: 'Редактировать', exact: true }).nth(i).click();
    await button('Открыть в редакторе').click();
  };
  const json = async () => JSON.parse(await download(() => button('Скачать данные миссии JSON').click()));
  const err = (error) => errors.push(error.message);
  const dialogs = (dialog) => dialog.accept();
  page.on('pageerror', err); page.on('dialog', dialogs);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { window.confirm = () => true; });
    if (await button('Закрыть окно').count()) await button('Закрыть окно').click();
    await button('Настройки и справка').click();
    await button('Начать с нуля').click();
    await region().getByRole('button', {name:'Редактировать',exact:true}).first().waitFor();
    check('Three defaults plus a permanent upload card', await region().locator('article').count() === 4);
    const original = JSON.parse(await download(() => button('Скачать миссию: Демо 1 · Фотосъёмка квадрата').click()));
    for (let i = 0; i < 5; i++) {
      const doc = JSON.parse(JSON.stringify(original)); doc.id = `expert-custom-${i}`; doc.name = `Проверка эксперта ${i + 1}`; doc.scenario.wind.speedMps = 2;
      await importFile(doc);
      const conflict = page.getByRole('checkbox', {name: /Использовать/});
      if (await conflict.count()) await conflict.check();
      await button('Открыть в редакторе').click();
      await button('Объекты карты').click();
      const out = await json();
      check(`Import preserves custom ID and wind ${i + 1}`, out.id === doc.id && out.scenario.wind.speedMps === 2);
      check(`Import preserves work geometry ${i + 1}`, JSON.stringify(out.jobs) === JSON.stringify(doc.jobs));
    }
    await nav('Миссии').click();
    check('Five imports create eight independent missions and upload card', await region().locator('article').count() === 9);
    await page.screenshot({ path: 'output/playwright/queue-20260924-cards.png', fullPage: true });
    await importFile('{broken', true);
    check('Broken import keeps existing cards', await region().locator('article').count() === 9 && await page.getByRole('dialog').count() === 0);
    await importFile(original);
    check('Duplicate ID requires explicit choice', await button('Открыть в редакторе').isDisabled());
    await button('Отмена').click();
    check('Cancel duplicate preserves all cards', await region().locator('article').count() === 9);
    await importFile(original);
    await page.getByRole('checkbox', {name: 'Создать отдельную копию с новым ID'}).check();
    const conflict = page.getByRole('checkbox', { name: /Использовать/ });
    if (await conflict.count()) await conflict.check();
    await button('Открыть в редакторе').click();
    await button('Объекты карты').click();
    const copy = await json();
    check('Duplicate can create an independent copy', copy.id !== original.id);
    await nav('Миссии').click();
    await button(`Удалить миссию: ${copy.name}`).click();
    check('Delete one copy preserves neighbours', await region().locator('article').count() === 9);
    await openCard(0);
    await button('Объекты карты').click();
    await page.getByRole('tab', { name: 'Граница полётов', exact: true }).click();
    await button('Очистить границу').click();
    check('Missing boundary disables calculation', await button('Рассчитать варианты').isDisabled());
    await button('Восстановить границу').click();
    check('Restore exact boundary', JSON.stringify((await json()).scenario.airspace) === JSON.stringify(original.scenario.airspace));
    await button('Изменить точки').click();
    check('Boundary editing exposes map vertex handles', await page.locator('.leaflet-marker-draggable').count() > 0);
    const vertex = page.locator('.mission-area-vertex').first();
    await vertex.waitFor({state:'visible'});
    const vertexBox = await vertex.boundingBox();
    const mapBox = await page.getByRole('region', {name:'Карта полётной миссии',exact:true}).boundingBox();
    check('Boundary vertices fit inside the map', vertexBox && vertexBox.x >= mapBox.x && vertexBox.y >= mapBox.y && vertexBox.x + vertexBox.width <= mapBox.x + mapBox.width && vertexBox.y + vertexBox.height <= mapBox.y + mapBox.height);
    await page.mouse.move(vertexBox.x + vertexBox.width / 2, vertexBox.y + vertexBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(vertexBox.x + 30, vertexBox.y + 30, {steps:5});
    await page.mouse.up();
    check('Dragging a boundary vertex changes the saved geometry', JSON.stringify((await json()).scenario.airspace) !== JSON.stringify(original.scenario.airspace));
    await button('Отмена правки границы').click();
    check('Cancel boundary editing restores exact original geometry', JSON.stringify((await json()).scenario.airspace) === JSON.stringify(original.scenario.airspace));
    await page.getByRole('tab', { name: 'Базы и посадка', exact: true }).click();
    await button('Добавить базу').click();
    const map = page.getByRole('region', { name: 'Карта полётной миссии', exact: true });
    const box = await map.boundingBox();
    await map.click({ position: { x: box.width * 0.45, y: box.height * 0.6 } });
    await page.locator('.base-editor-coordinates summary').click();
    check('Map selection fills base coordinates', Number(await page.getByRole('spinbutton', {name:'Долгота базы'}).inputValue()) !== original.scenario.vehicles[0].start[0]);
    await button('Закрыть настройки базы').click();
    check('Cancelled base does not change input', JSON.stringify((await json()).bases) === JSON.stringify(original.bases));
    await button('Добавить базу').click();
    await page.getByRole('textbox', {name:'Название базы', exact:true}).fill('База эксперта');
    await page.locator('.base-editor-coordinates summary').click();
    await page.getByRole('spinbutton', {name:'Долгота базы'}).fill('30.303');
    await page.getByRole('spinbutton', {name:'Широта базы'}).fill('60.033');
    await button('Изменить БВС').click();
    await page.getByRole('region', {name:'Объекты карты', exact:true}).getByRole('checkbox').nth(0).check();
    await page.getByRole('region', {name:'Объекты карты', exact:true}).getByRole('checkbox').nth(1).check();
    await button('Создать базу').click();
    await page.getByRole('textbox', {name:'Название базы', exact:true}).waitFor({state:'hidden'});
    const moved = await json();
    const base = moved.bases.find((b) => b.name === 'База эксперта');
    check('Shared base has separate explicit pads', base?.landingPads?.length === 2 && JSON.stringify(base.landingPads[0].coordinate) !== JSON.stringify(base.landingPads[1].coordinate));
    check('Base move preserves battery charge', JSON.stringify(moved.batteries.map((b)=>b.initialPct)) === JSON.stringify(original.batteries.map((b)=>b.initialPct)));
    const solveAfterMove = page.waitForResponse(r => r.url().includes('/missions/solve') && r.request().method() === 'POST', {timeout:60000});
    await button('Рассчитать варианты').click();
    const moveResult = await (await solveAfterMove).json();
    check('Shared-base placement has a feasible fully rechecked plan', moveResult.candidates.some(c => c.status === 'feasible_model'), moveResult.candidates.map(c => ({status:c.status,checks:c.checks?.filter(check => check.status === 'fail')})));
    await button('Проверить и подтвердить').waitFor();
    await nav('Миссии').click();
    await openCard(3); await button('Объекты карты').click();
    const related = await json();
    check('Other draft sees shared UAV base change', JSON.stringify(related.scenario.vehicles[0].start) === JSON.stringify(moved.scenario.vehicles[0].start));
    await openCard(0); await button('Объекты карты').click();
    await page.getByRole('button', {name:'База эксперта · 2 БВС', exact:true}).click();
    await button('Удалить базу').click();
    check('Cannot delete occupied base without reassignment', await button('Подтвердить удаление').isDisabled());
    await page.getByRole('combobox', {name:'База для переназначения'}).selectOption({index:1});
    await button('Подтвердить удаление').click();
    await page.getByRole('textbox', {name:'Название базы', exact:true}).waitFor({state:'hidden'});
    check('Delete with reassignment removes only base', !(await json()).bases.some((b)=>b.name==='База эксперта'));
    await page.getByRole('tab', {name:'Запреты и препятствия', exact:true}).click();
    // Avoid the OS picker in the batch; the native picker is checked separately via CLI upload.
    await button('Загрузить запретные зоны').evaluate((el) => {
      // oxlint-disable-next-line typescript/unbound-method -- Saved for restoration, not called without a receiver.
      const click = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = () => {};
      try { el.click(); } finally { HTMLInputElement.prototype.click = click; }
    });
    await supplyFile('Файл координатного слоя', 'zone.geojson', JSON.stringify({type:'Feature',geometry:original.jobs[0].area,properties:{name:'Проверочная зона'}}));
    await page.getByRole('dialog', {name:'Импорт координатного слоя'}).waitFor();
    check('Zone import does not default to replacing work area', await page.getByRole('dialog', {name:'Импорт координатного слоя'}).getByRole('combobox').first().inputValue() === 'exclusion');
    await button('Отмена').click();
    await page.setViewportSize({width:900,height:900});
    check('No page-wide horizontal overflow on narrow display', await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:'output/playwright/queue-20260924-objects.png'});
    check('No browser runtime errors', errors.length === 0, errors);
  } finally {
    await page.evaluate((report) => { window.__queueReport = report; }, {passed:checks.filter(c=>c.pass).length,checks,errors});
    page.off('pageerror',err); page.off('dialog',dialogs);
  }
  return { passed: checks.length, checks, errors };
}
