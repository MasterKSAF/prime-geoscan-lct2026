async (page) => {
  const checks=[],errors=[],out='output/playwright/acceptance-2026-09-25/ui/';
  const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
  const button=name=>page.getByRole('button',{name,exact:true});
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const save=async(target,file)=>{const pending=page.waitForEvent('download');await target.click();const d=await pending;await d.saveAs(out+file);return file;};
  const json=async(value,file)=>{const pending=page.waitForEvent('download');await page.evaluate(({value,file})=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},{value,file});await(await pending).saveAs(out+file);};
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.setViewportSize({width:1600,height:1000});
  try {
    await page.locator('[data-scenario-id="demo-02-expert-obstacles"]').getByRole('button',{name:'Редактировать',exact:true}).click();
    await button('Открыть в редакторе').click();
    const pending=page.waitForResponse(r=>r.url().includes('/missions/solve')&&r.request().method()==='POST',{timeout:120000});
    await button('Рассчитать варианты').click();const response=await pending,result=await response.json();
    await json(result,'demo2.solve-response.json');
    check('Current engine 0.4.0 and correct Demo2 identity',result.engineVersion==='0.4.0'&&result.document.id==='demo-02-expert-obstacles',{engineVersion:result.engineVersion,id:result.document.id});
    check('Both objective plans are feasible',response.ok()&&result.candidates.every(c=>c.status==='feasible_model'),result.candidates.map(c=>({id:c.id,status:c.status,metrics:c.metrics})));
    check('Real expert obstacles are validated',!!result.document.obstacleLayer?.sourceText&&result.candidates.every(c=>c.checks.some(k=>k.id==='EXTERNAL_OBSTACLES'&&k.status==='pass')),result.candidates[0].checks.find(k=>k.id==='EXTERNAL_OBSTACLES'));
    check('Every camera sortie is bound to a vehicle camera',result.candidates.every(c=>c.sorties.every(s=>!!s.cameraId)),result.candidates.map(c=>c.sorties.map(s=>({vehicleId:s.vehicleId,cameraId:s.cameraId}))));
    await button('Проверить и подтвердить').waitFor();await page.screenshot({path:out+'demo2-plans.png'});
    await button('Проверить и подтвердить').click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();await button('Подтвердить для симуляции').click();await button('К выполнению').click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('300');await button('Выполнить миссию').click();
    await button('Пауза').waitFor({timeout:120000});await page.screenshot({path:out+'demo2-running.png'});
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:180000});
    check('Demo2 actually completes through UI',true);await page.screenshot({path:out+'demo2-completed.png'});
    await nav('Отчёт').click();const row=page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').filter({hasText:'Участки и препятствия экспертов'}).first();
    await save(row.getByRole('button',{name:/^Скачать доказательства:/}),'demo2.completed.evidence.zip');
    await row.locator('summary').filter({hasText:'Скачать маршруты'}).click();
    await save(row.getByRole('button',{name:/^Маршруты KML:/}),'demo2.routes-kml.zip');await save(row.getByRole('button',{name:/^Маршруты GEOJSON:/}),'demo2.routes-geojson.zip');
    await row.locator('summary').filter({hasText:'Другие файлы'}).click();await save(row.getByRole('button',{name:'Проверки JSON',exact:true}),'demo2.checks.json');
    check('Completed proof, checks and both route formats downloaded',true);
    await page.screenshot({path:out+'demo2-report.png'});check('No browser exceptions',errors.length===0,errors);
    return {checks,errors,engineVersion:result.engineVersion,inputHash:result.inputHash,candidates:result.candidates.map(c=>({id:c.id,status:c.status,metrics:c.metrics,sorties:c.sorties.map(s=>({id:s.id,vehicleId:s.vehicleId,cameraId:s.cameraId,jobId:s.jobId}))}))};
  } finally {await page.evaluate(report=>{window.__acceptance20260925=report;},{checks,errors});}
}
