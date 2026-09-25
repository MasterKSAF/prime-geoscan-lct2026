/* oxlint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [], calculations = [], errors = [];
  const prefix = page.url().includes('airspace-0.3.9') ? 'airspace-prod' : page.url().includes(':3016/') ? 'queue-prod' : 'queue-dev';
  const check = (name, pass, detail) => { checks.push({name,pass:!!pass,detail}); if (!pass) throw Error(name + ': ' + JSON.stringify(detail)); };
  const nav = (name) => page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const button = (name) => page.getByRole('button',{name,exact:true});
  const errorsListener = (e) => errors.push(e.message);
  page.on('pageerror', errorsListener);
  const save = async (target, name) => { const pending=page.waitForEvent('download'); await target.click(); await (await pending).saveAs(`output/playwright/${prefix}-${name}`); };
  const open = async (i) => {
    await nav('Миссии').click(); await page.getByRole('region',{name:'Миссии и загрузка'}).locator('article').nth(i).getByRole('button',{name:/^Редактировать/}).click(); await button('Открыть в редакторе').click();
  };
  const solve = async () => {
    const pending=page.waitForResponse(r=>r.url().includes('/missions/solve') && r.request().method()==='POST',{timeout:60000});
    await button('Рассчитать варианты').click(); const response=await pending, result=await response.json();
    check('Calculation returns HTTP 200',response.ok(),response.status());
    await button('Проверить и подтвердить').waitFor();
    return result;
  };
  try {
    await page.evaluate(()=>{window.confirm=()=>true;});
    await button('Настройки и справка').click(); await button('Начать с нуля').click();
    await page.getByRole('region',{name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).first().waitFor();
    let first;
    for (let i=0;i<3;i++) {
      await open(i);
      if (!i) {
        await nav('Выполнение').click();
        check('Before planning only useful calculate action is shown',await button('Рассчитать план').isVisible() && await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).count()===0);
        await nav('Редактор').click();
      }
      const result=await solve(); if (!i) first=result.document;
      check(`Demo ${i+1} expected result`,result.candidates.every(c=>i<2?c.status==='feasible_model':c.status!=='feasible_model'));
      calculations.push({id:result.document.id,candidates:result.candidates.map(c=>({id:c.id,status:c.status,makespanSec:c.metrics.makespanSec,coveragePct:c.metrics.coveragePct}))});
      if (i === 1) {
        await button('Проверить и подтвердить').click();
        await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();
        await button('Подтвердить для симуляции').click(); await button('К выполнению').click();
        await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('300');
        await button('Выполнить миссию').click();
        await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:60000});
        check('Demo 2 completes its obstacle-aware plan through UI', true);
      }
      await nav('Отчёт').click();
      const row=page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').nth(i);
      check(`Demo ${i+1} report has direct checks`,await row.getByRole('button',{name:/Все проверки:/}).isEnabled());
      await row.locator('summary').filter({hasText:'Скачать маршруты'}).click();
      if (i<2) {
        await save(row.getByRole('button',{name:/^Маршруты KML:/}),`demo${i+1}-routes-kml.zip`);
        await save(row.getByRole('button',{name:/^Маршруты GEOJSON:/}),`demo${i+1}-routes-geojson.zip`);
      } else check('Refused mission has no misleading route download',await row.getByRole('button',{name:/^Маршруты KML:/}).isDisabled());
      await save(row.getByRole('button',{name:/Скачать доказательства:/}),`demo${i+1}.evidence.zip`);
      check(`Demo ${i+1} evidence downloaded`,true);
    }
    first.id='expert-roundtrip'; first.name='Своя миссия эксперта'; delete first.fleetSnapshot;
    await nav('Миссии').click();
    await page.getByLabel('Файл миссии',{exact:true}).evaluate((el,text)=>{const dt=new DataTransfer();dt.items.add(new File([text],'custom.mission.json',{type:'application/json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));},JSON.stringify(first));
    await page.getByRole('dialog',{name:'Проверка перед загрузкой'}).waitFor();
    const checkbox=page.getByRole('checkbox',{name:/Использовать текущие характеристики/}); if(await checkbox.count())await checkbox.check();
    await button('Открыть в редакторе').click();
    const custom=await solve();
    check('Arbitrary imported ID solves without demo reassignment',custom.document.id==='expert-roundtrip' && custom.candidates[0].status==='feasible_model');
    await button('Проверить и подтвердить').click();
    await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();
    await button('Подтвердить для симуляции').click(); await button('К выполнению').click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('300');
    await button('Выполнить миссию').click();
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:60000});
    check('Custom mission completes through actual UI',true);
    await nav('Отчёт').click();
    const row=page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').last();
    check('Execution progress and coverage are separate', (await row.innerText()).includes('Проходы: 100%') && (await row.innerText()).includes('Покрытие:'));
    await save(row.getByRole('button',{name:/Скачать доказательства:/}),'custom-completed.evidence.zip');
    await page.screenshot({path:`output/playwright/${prefix}-reports.png`});
    check('No browser exceptions',errors.length===0,errors);
  } finally {
    page.off('pageerror',errorsListener);
    await page.evaluate((report)=>{window.__queuePlans=report;},{passed:checks.filter(c=>c.pass).length,checks,calculations,errors});
  }
  return {passed:checks.length,checks,calculations,errors};
}
