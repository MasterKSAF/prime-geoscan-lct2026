async (page) => {
 const checks=[],errors=[],out='output/playwright/safety-2026-09-20';
 const check=(name,pass,detail='')=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name+': '+detail);};
 page.removeAllListeners('dialog');page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept().catch(()=>{}));
 const tab=async name=>page.getByRole('tab',{name:new RegExp('^'+name)}).click();
 const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/${name}.png`});};
 const closeRun=async()=>{await page.getByRole('button',{name:'Закрыть выполнение',exact:true}).click();await page.getByRole('button',{name:'Закрыть выполнение',exact:true}).waitFor({state:'hidden'});};
 async function run(kind){
  await tab('Миссии');await page.locator('input[type=file][accept=".json,.yaml,.yml"]').setInputFiles('public/planner/scenarios/area-with-hole.mission.json');
  await page.getByRole('button',{name:'Заменить текущее задание',exact:true}).click();
  await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();
  await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();
  await page.getByRole('dialog').getByRole('checkbox').check();await page.getByRole('dialog').getByRole('button',{name:/Подтвердить/}).click();
  await page.getByRole('button',{name:'К выполнению',exact:true}).click();
  await page.getByRole('combobox',{name:'Скорость симуляции'}).selectOption('100');
  await page.locator('.mw-playback').getByRole('button',{name:'Начать симуляцию',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.mw-flight-card small')].some(el=>el.textContent==='Работа сенсора'));
  await page.getByRole('combobox',{name:'Скорость симуляции'}).selectOption('1');
  await page.locator('.mw-safety-console summary').first().click();
  await page.getByRole('combobox',{name:'Событие',exact:true}).selectOption(kind);
  if(kind==='wind')await page.getByRole('spinbutton',{name:'Ветер события'}).fill('30');
  await page.getByRole('button',{name:'Внести событие',exact:true}).click();await page.locator('.mw-safety-heading').waitFor();
 }
 try {
  await page.setViewportSize({width:1440,height:1000});await page.reload();
  await page.getByRole('button',{name:'Открыть выполнение',exact:true}).first().click();
  await page.getByRole('combobox',{name:'Скорость возврата',exact:true}).selectOption('300');
  await page.getByRole('button',{name:'Продолжить возврат',exact:true}).click();
  await page.getByRole('button',{name:'Закрыть выполнение',exact:true}).waitFor({timeout:20000});
  check('validated recovery reaches landing',await page.locator('.mw-safety-heading').innerText().then(t=>t.includes('Возврат завершён')));
  await shot('landed');await closeRun();
  await tab('Миссии');await page.locator('.mo-stats button[data-status=cancelled]').click();
  check('interrupted mission is in history not falsely completed',await page.locator('.mo-list').innerText().then(t=>t.includes('Остановлено')));
  await run('wind');check('unsafe wind immediately blocks return',await page.locator('.mw-safety-heading').innerText().then(t=>t.includes('Возврат не подтверждён')));
  check('blocked wind cannot start return',await page.getByRole('button',{name:/Вернуться на свои базы/}).count()===0);await shot('blocked-wind');await closeRun();
  await run('crash');check('crash has no return option',await page.locator('.mw-safety-heading').innerText().then(t=>t.includes('Аппарат выведен'))&&await page.getByRole('button',{name:/Вернуться на свои базы/}).count()===0);await shot('crash');await closeRun();
  await run('obstacle');check('obstacle offers a checked route around known contour',await page.getByRole('button',{name:/Вернуться на свои базы/}).isEnabled());
  const started=Date.now();await page.getByRole('button',{name:'Пауза возврата',exact:true}).waitFor({timeout:75000});
  const waited=Date.now()-started;check('actual sixty-second operator timeout chooses return',waited>=55000,`${waited} ms`);
  await page.getByRole('combobox',{name:'Скорость возврата',exact:true}).selectOption('300');
  await page.getByRole('button',{name:'Закрыть выполнение',exact:true}).waitFor({timeout:20000});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Журнал события',exact:true}).click();await(await download).saveAs(`${out}/timeout-incident.json`);await closeRun();
  await page.getByRole('button',{name:'Создать пересмотр задания',exact:true}).click();
  await page.getByRole('button',{name:'Заменить текущее задание',exact:true}).click();
  check('revision opens editor and needs a new solve',await page.locator('main').getAttribute('data-workspace')==='planning'&&await page.getByRole('textbox',{name:'Название миссии',exact:true}).inputValue().then(t=>t.includes('пересмотр')));
  await page.getByRole('button',{name:'Настройки и справка'}).click();await page.getByRole('combobox',{name:'Тема интерфейса'}).selectOption('dark');await page.getByRole('dialog').getByRole('button',{name:'Закрыть окно',exact:true}).click();await shot('dark-final');
  check('no unhandled errors in negative and timeout cases',errors.length===0,errors.join('\n'));
 } catch(e){checks.push({name:'fatal',pass:false,detail:String(e)});await shot('decisions-failure');}
 const report={at:new Date().toISOString(),checks,errors};page.__decisionsReport=report;return report;
}
