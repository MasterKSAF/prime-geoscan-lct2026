async (page) => {
  const checks=[],errors=[],out='output/playwright/acceptance-2026-09-25/ui/';
  const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
  const button=name=>page.getByRole('button',{name,exact:true});
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const save=async(target,file)=>{const pending=page.waitForEvent('download');await target.click();await(await pending).saveAs(out+file);};
  const json=async(value,file)=>{const pending=page.waitForEvent('download');await page.evaluate(({value,file})=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},{value,file});await(await pending).saveAs(out+file);};
  const solve=async()=>{const p=page.waitForResponse(r=>r.url().includes('/missions/solve')&&r.request().method()==='POST',{timeout:120000});await button('Рассчитать варианты').click();const r=await p;check('Calculation HTTP 200',r.ok(),r.status());return r.json();};
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.setViewportSize({width:1600,height:1000});
  try {
    await page.locator('[data-scenario-id="demo-03-repair"]').getByRole('button',{name:'Редактировать',exact:true}).click();await button('Открыть в редакторе').click();
    const refused=await solve();await json(refused,'demo3.refused.solve-response.json');
    check('Current engine refuses original insufficient-charge Demo3',refused.engineVersion==='0.4.0'&&refused.document.id==='demo-03-repair'&&refused.candidates.every(c=>c.status!=='feasible_model'),refused.candidates.map(c=>({status:c.status,failures:c.checks.filter(k=>k.status==='fail')})));
    check('Unsafe mission cannot be approved',await button('Проверить и подтвердить').isDisabled());
    await nav('Отчёт').click();const refusalRow=page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').filter({hasText:'Недостаточный заряд и решение'}).first();await save(refusalRow.getByRole('button',{name:/^Скачать доказательства:/}),'demo3.refused.evidence.zip');await refusalRow.getByRole('button',{name:/^Все проверки:/}).click();
    const repairs=page.locator('details.mi-repairs');if(await repairs.getAttribute('open')===null)await repairs.locator(':scope > summary').click();
    const trial=page.locator('.mi-cards article').filter({has:page.getByRole('heading',{name:/Заменить батарею:/})}).first();
    await trial.scrollIntoViewIfNeeded();await page.screenshot({path:out+'demo3-refusal-repair.png'});
    const pendingTrial=page.waitForResponse(r=>r.url().includes('/missions/solve')&&r.request().method()==='POST',{timeout:120000});await trial.getByRole('button',{name:'Проверить вариант',exact:true}).click();const trialResult=await(await pendingTrial).json();await json(trialResult,'demo3.battery-trial.solve-response.json');
    await trial.getByText('С этими изменениями миссию можно выполнить в модели.',{exact:true}).waitFor({timeout:120000});check('Battery replacement trial is recalculated and feasible',trialResult.candidates.some(c=>c.status==='feasible_model'));
    await page.screenshot({path:out+'demo3-repair-validated.png'});await trial.screenshot({path:out+'demo3-repair-card.png'});
    const acknowledge=trial.getByRole('checkbox');if(await acknowledge.count())await acknowledge.check();await trial.getByRole('button',{name:'Открыть исправленную миссию',exact:true}).click();
    await page.getByRole('dialog',{name:'Проверка перед загрузкой'}).waitFor();await button('Открыть в редакторе').click();
    const repaired=await solve();await json(repaired,'demo3.repaired.solve-response.json');
    check('Explicit battery repair changes input hash and produces feasible recalculation',repaired.inputHash!==refused.inputHash&&repaired.candidates.some(c=>c.status==='feasible_model'),{originalHash:refused.inputHash,repairedHash:repaired.inputHash,batteries:repaired.document.batteries});
    await button('Проверить и подтвердить').click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();await button('Подтвердить для симуляции').click();await button('К выполнению').click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('300');await button('Выполнить миссию').click();
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:180000});check('Repaired mission actually completes through UI',true);await page.screenshot({path:out+'demo3-repaired-completed.png'});
    await nav('Отчёт').click();const fixed=page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').filter({hasText:'Недостаточный заряд и решение'}).first();check('Repaired run is completed in mission report',/Завершена|Завершено/.test(await fixed.innerText()),await fixed.innerText());await save(fixed.getByRole('button',{name:/^Скачать доказательства:/}),'demo3.repaired.evidence.zip');
    await fixed.locator('summary').filter({hasText:'Скачать маршруты'}).click();await save(fixed.getByRole('button',{name:/^Маршруты KML:/}),'demo3.repaired.routes-kml.zip');await save(fixed.getByRole('button',{name:/^Маршруты GEOJSON:/}),'demo3.repaired.routes-geojson.zip');
    await fixed.locator('summary').filter({hasText:'Другие файлы'}).click();await save(fixed.getByRole('button',{name:'Проверки JSON',exact:true}),'demo3.repaired.checks.json');check('Diagnostic and completed evidence plus routes downloaded',true);
    await page.screenshot({path:out+'demo3-report.png'});check('No browser exceptions',errors.length===0,errors);
    return {checks,errors,engineVersion:repaired.engineVersion,refused:{inputHash:refused.inputHash,candidates:refused.candidates.map(c=>({id:c.id,status:c.status,metrics:c.metrics}))},repaired:{id:repaired.document.id,inputHash:repaired.inputHash,candidates:repaired.candidates.map(c=>({id:c.id,status:c.status,metrics:c.metrics}))}};
  } finally {await page.evaluate(report=>{window.__acceptance20260925=report;},{checks,errors});}
}
