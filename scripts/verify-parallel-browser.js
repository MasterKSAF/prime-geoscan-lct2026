async page => {
  const checks=[],errors=[],out='output/playwright/eight-parallel';
  const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const read=()=>page.evaluate(async()=>new Promise((resolve,reject)=>{const q=indexedDB.open('prime-planner-operations',2);q.onsuccess=()=>{const db=q.result,tx=db.transaction('operations'),r=tx.objectStore('operations').getAll();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();};q.onerror=()=>reject(q.error);}));
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
  const start=async file=>{
    await page.getByLabel('Файл миссии',{exact:true}).setInputFiles(file);
    await page.getByRole('dialog',{name:'Проверка перед загрузкой'}).getByRole('button',{name:'Заменить текущую миссию',exact:true}).click();
    await page.getByRole('button',{name:'Расчёт вариантов',exact:true}).click();
    const pending=page.waitForResponse(r=>r.url().endsWith('/api/planner/missions/solve')&&r.request().method()==='POST');await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();await pending;
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Подтвердить модельный план'});await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();
    await nav('Выполнение').click();await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('1');await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();
  };
  try {
    await page.setViewportSize({width:1440,height:960});await nav('Редактор').click();
    await start('public/planner/scenarios/demo-01-survey.mission.json');await page.waitForTimeout(400);
    check('first mission is running',(await read()).filter(r=>r.status==='running').length===1);
    await nav('Миссии').click();await start('public/planner/scenarios/demo-parallel-east.mission.json');
    await page.waitForTimeout(3000);const before=await read();check('two distinct missions run simultaneously',before.filter(r=>r.status==='running').length===2);
    await page.waitForTimeout(3000);const after=await read();check('both independent clocks advance',before.every(r=>after.find(x=>x.id===r.id).progressSec>r.progressSec));
    await nav('Миссии').click();const home=page.getByRole('region',{name:'Список миссий'});await home.getByRole('button',{name:/^Выполняются/}).click();check('mission browser lists both runs',await home.locator('.mb-record').count()===2);
    await home.locator('.mb-record').filter({hasText:'Демо 1 · Фотосъёмка квадрата'}).getByRole('button',{name:'Наблюдать',exact:true}).click();
    const tabs=page.getByRole('generic',{name:'Раздел выполнения'});
    await page.locator('[aria-label="Раздел выполнения"]').getByRole('button',{name:'Журнал',exact:true}).click();check('selected mission has its own inline journal',(await page.locator('.moj-heading').innerText()).includes('Демо 1'));
    await page.locator('[aria-label="Раздел выполнения"]').getByRole('button',{name:'Сводка',exact:true}).click();
    await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.waitForTimeout(200);
    const paused=await read();check('pausing selected mission preserves other execution',paused.filter(r=>r.status==='paused').length===1&&paused.filter(r=>r.status==='running').length===1);
    await page.screenshot({path:out+'/two-missions.png',fullPage:true});check('no JavaScript errors',errors.length===0);
  }catch(e){checks.push({name:'fatal',pass:false,detail:String(e)});await page.screenshot({path:out+'/failure.png',fullPage:true});}
  const report={at:new Date().toISOString(),status:checks.every(c=>c.pass)?'pass':'fail',checks,errors};const p=page.waitForEvent('download');await page.evaluate(report=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download='parallel.json';a.click();},report);await(await p).saveAs(out+'/report.json');return report;
}
