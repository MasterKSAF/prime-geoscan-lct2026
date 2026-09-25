/* oxlint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, ok) => { checks.push({name,pass:!!ok}); if (!ok) throw Error(name); };
  const button = name => page.getByRole('button',{name,exact:true});
  const nav = name => page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const err = e => errors.push(e.message);
  const json = async () => {
    const pending=page.waitForEvent('download'); await button('Скачать данные миссии JSON').click();
    const stream=await (await pending).createReadStream(); stream.setEncoding('utf8');
    let value=''; for await(const chunk of stream)value+=chunk; return JSON.parse(value);
  };
  const importLayer = async (name, file, role) => {
    const response = await page.request.get(`${page.url().split('/').slice(0,3).join('/')}/planner/samples/${file}`);
    check(`Sample ${file} is served`,response.ok());
    const text=await response.text();
    // oxlint-disable-next-line typescript/unbound-method -- Saved for restoration, not called without a receiver.
    await button(name).evaluate(el=>{const click=HTMLInputElement.prototype.click; HTMLInputElement.prototype.click=()=>{};try{el.click();}finally{HTMLInputElement.prototype.click=click;}});
    await page.getByLabel('Файл координатного слоя',{exact:true}).evaluate((el,data)=>{const dt=new DataTransfer();dt.items.add(new File([data.text],data.file,{type:'application/geo+json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));},{text,file});
    const dialog=page.getByRole('dialog',{name:'Импорт координатного слоя'});
    await dialog.waitFor(); check(`Context selects ${role} for ${file}`,await dialog.getByRole('combobox').first().inputValue()===role);
    await button('Применить весь слой').click(); await dialog.waitFor({state:'hidden'});
    return JSON.parse(text);
  };
  page.on('pageerror',err);
  try {
    await page.evaluate(()=>{window.confirm=()=>true;});
    await button('Настройки и справка').click(); await button('Начать с нуля').click();
    await page.getByRole('region',{name:'Миссии и загрузка'}).locator('article').first().getByRole('button',{name:'Редактировать',exact:true}).click();
    await button('Открыть в редакторе').click(); await button('Объекты карты').click();
    const original=await json();
    await page.getByRole('tab',{name:'Граница полётов',exact:true}).click();
    const boundary=await importLayer('Загрузить границу','flight-boundary.geojson','airspace');
    check('Boundary imports actual sample coordinates',JSON.stringify((await json()).scenario.airspace.coordinates)===JSON.stringify(boundary.features[0].geometry.coordinates));
    await page.getByRole('tab',{name:'Базы и посадка',exact:true}).click();
    const reserve=await importLayer('Площадки из файла','reserve-site.geojson','reserve');
    const reservePoint=reserve.features[0].geometry.coordinates;
    const withReserve=await json();
    check('Reserve import adds a reserve, not a work or base',withReserve.scenario.reserveSites.some(p=>JSON.stringify(p)===JSON.stringify(reservePoint)) && withReserve.jobs.length===original.jobs.length && (withReserve.bases?.length ?? 0)===(original.bases?.length ?? 0));
    await button(`Удалить запасную площадку ${withReserve.scenario.reserveSites.length}`).click();
    check('Reserve can be deleted', (await json()).scenario.reserveSites.length===original.scenario.reserveSites.length);
    await page.getByRole('tab',{name:'Запреты и препятствия',exact:true}).click();
    await importLayer('Загрузить запретные зоны','no-flight-zone.geojson','exclusion');
    const restricted=await json();
    check('No-flight layer preserves work geometry',JSON.stringify(restricted.jobs)===JSON.stringify(original.jobs));
    check('No-flight layer creates a restriction',restricted.scenario.exclusions.length===original.scenario.exclusions.length+1 || restricted.restrictions.length===original.restrictions.length+1);
    const remove=button('Удалить зону');
    if (await remove.count()) await remove.last().click();
    else { await page.locator('.mission-map-objects summary').first().click(); await button('Удалить ограничение').last().click(); }
    const cleared=await json();
    check('Restriction removal restores original counts',cleared.scenario.exclusions.length===original.scenario.exclusions.length && cleared.restrictions.length===original.restrictions.length);
    await button('Добавить запретную зону').click();
    const map=page.getByRole('region',{name:'Карта полётной миссии',exact:true}), box=await map.boundingBox();
    for (const [x,y] of [[.35,.33],[.6,.33],[.6,.55],[.35,.55]]) await map.click({position:{x:box.width*x,y:box.height*y}});
    await button('Применить контур').click(); await button('Объекты карты').click();
    const drawn=await json();
    check('Drawn zone is saved as a closed restriction',drawn.restrictions.length===original.restrictions.length+1 && drawn.restrictions.at(-1).geometry.coordinates[0].length>=4);
    check('Drawing a restriction does not activate unrelated area vertices',await page.locator('.mission-area-vertex').count()===0);
    for(const theme of ['dark','light']) {
      await button('Настройки и справка').click(); await page.getByRole('combobox',{name:'Тема интерфейса'}).selectOption(theme); await button('Закрыть окно').click();
      check(`${theme} theme applied`,await page.evaluate(()=>document.documentElement.dataset.primeTheme)===theme);
      await page.screenshot({path:`output/playwright/queue-prod-layers-${theme}.png`});
    }
    await nav('Отчёт').click(); await button('Назад').click();
    check('Back returns from reports to editor',await nav('Редактор').getAttribute('aria-selected')==='true');
    check('No runtime exceptions in layer lifecycle',errors.length===0);
  } finally {
    page.off('pageerror',err);
    await page.evaluate(report=>{window.__queueLayers=report;},{passed:checks.filter(c=>c.pass).length,checks,errors});
  }
  return {passed:checks.length,checks,errors};
}
