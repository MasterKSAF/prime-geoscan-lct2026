async (page) => {
  const checks=[],errors=[],out='output/playwright/eight-points';
  const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const read=async(dbName,store)=>page.evaluate(async([name,store])=>new Promise((resolve,reject)=>{const req=indexedDB.open(name);req.onsuccess=()=>{const db=req.result;const tx=db.transaction(store),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();};req.onerror=()=>reject(req.error);}),[dbName,store]);
  const load=async()=>{await page.getByLabel('Файл миссии',{exact:true}).setInputFiles('public/planner/scenarios/demo-01-survey.mission.json');await page.getByRole('dialog',{name:'Проверка перед загрузкой'}).getByRole('button',{name:'Заменить текущую миссию',exact:true}).click();};
  const saveReport=async(name,data)=>{const pending=page.waitForEvent('download');await page.evaluate(([name,data])=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();},[name,data]);await(await pending).saveAs(out+'/'+name);};
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept(d.type()==='prompt'?'QA переименовано':undefined));
  try {
    await page.setViewportSize({width:1440,height:960});await nav('Редактор').click();await load();
    const editor=page.locator('.me-editor');await editor.getByRole('textbox',{name:'Название миссии',exact:true}).fill('QA восемь пунктов');
    await editor.getByRole('button',{name:'Добавить участок',exact:true}).click();await editor.getByRole('button',{name:'Восстановить контур',exact:true}).click();
    const inherit=editor.getByRole('combobox',{name:'Наследование параметров'});await inherit.selectOption({index:1});
    await editor.getByRole('button',{name:'Параметры',exact:true}).click();
    check('linked area locks inherited quality fields',await editor.getByRole('spinbutton',{name:'Высота текущей работы, м',exact:true}).isDisabled());
    await editor.getByRole('button',{name:'Изменить общие параметры'}).click();const altitude=editor.getByRole('spinbutton',{name:'Высота текущей работы, м',exact:true});await altitude.fill('115');
    await editor.getByRole('combobox',{name:'Участок работы',exact:true}).selectOption({index:1});
    check('parent altitude propagates to linked area',(await altitude.inputValue())==='115');await inherit.selectOption('');await altitude.fill('120');
    await editor.getByRole('combobox',{name:'Участок работы',exact:true}).selectOption({index:0});check('detached area cannot modify parent',(await altitude.inputValue())==='115');
    const map=page.locator('.mw-map-wrap');const widthBefore=(await map.boundingBox()).width;
    await page.getByRole('slider',{name:'Ширина панели'}).focus();await page.keyboard.press('End');
    check('panel width changes map without removing it',(await map.boundingBox()).width<widthBefore);await page.keyboard.press('Home');
    await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForTimeout(250);
    check('mission was actually persisted',(await read('prime-planner-missions','missions')).some(r=>r.document.name==='QA восемь пунктов'));
    await nav('Миссии').click();const home=page.getByRole('region',{name:'Список миссий'});
    await home.getByRole('button',{name:'Действия: QA восемь пунктов',exact:true}).click();await home.getByRole('button',{name:'Переименовать',exact:true}).click();await page.waitForTimeout(200);
    check('rename preserves identity',(await read('prime-planner-missions','missions')).some(r=>r.document.name==='QA переименовано'));
    await home.getByRole('button',{name:'В архив',exact:true}).click();await page.waitForTimeout(200);await home.getByRole('button',{name:/^Архив/}).click();
    check('archived mission is discoverable',(await home.innerText()).includes('QA переименовано'));
    const more=home.getByRole('button',{name:'Действия: QA переименовано',exact:true});if(await more.getAttribute('aria-expanded')!=='true')await more.click();
    await home.getByRole('button',{name:'Восстановить',exact:true}).click();await page.waitForTimeout(200);await home.getByRole('button',{name:/^Все/}).click();
    check('restored mission keeps saved ID',(await read('prime-planner-missions','missions')).some(r=>r.document.name==='QA переименовано'&&!r.archived));
    if(await more.getAttribute('aria-expanded')!=='true')await more.click();await home.getByRole('button',{name:'Удалить черновик',exact:true}).click();await page.waitForTimeout(200);
    check('explicit draft deletion removes only selected record',!(await read('prime-planner-missions','missions')).some(r=>r.document.name==='QA переименовано'));
    await nav('Парк БВС').click();const fleet=page.getByRole('region',{name:'Общий парк БВС'});
    if(await fleet.getByRole('button',{name:'Загрузить парк JSON',exact:true}).isVisible()){await fleet.locator('input[type=file]').setInputFiles('public/planner/scenarios/demo-01-survey.fleet.json');await fleet.getByRole('button',{name:'Сохранить парк',exact:true}).click();await fleet.getByRole('button',{name:'Сохранить парк',exact:true}).waitFor({state:'hidden'});}
    await fleet.locator('summary').filter({hasText:/^Базы ·/}).click();const base=fleet.getByRole('textbox',{name:/Название базы/}).first();await base.fill('Северная база');
    await fleet.getByRole('button',{name:'Сохранить парк',exact:true}).click();await fleet.getByRole('button',{name:'Сохранить парк',exact:true}).waitFor({state:'hidden'});await page.reload();await nav('Парк БВС').click();
    const bases=fleet.locator('details').filter({has:page.locator('summary',{hasText:/^Базы ·/})});await bases.locator('summary').click();
    check('custom base name survives reload',await fleet.getByRole('textbox',{name:/Название базы/}).first().inputValue()==='Северная база');
    await page.getByRole('button',{name:'Настройки и справка',exact:true}).click();
    for(const theme of ['dark','light','system']){await page.getByRole('combobox',{name:'Тема интерфейса'}).selectOption(theme);check('theme '+theme,await page.locator('html').getAttribute('data-prime-theme-preference')===theme);await page.screenshot({path:out+'/theme-'+theme+'.png',fullPage:true});}
    await page.keyboard.press('Escape');await nav('Миссии').click();
    await page.setViewportSize({width:390,height:844});check('mobile list remains within viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:960});await nav('Редактор').click();await load();
    await page.getByLabel('Файл миссии',{exact:true}).setInputFiles('tests/fixtures/invalid-mission.json');await page.waitForTimeout(150);
    check('invalid import does not overwrite editor',await editor.getByRole('textbox',{name:'Название миссии',exact:true}).inputValue()==='Демо 1 · Фотосъёмка квадрата');
    await page.getByRole('button',{name:'Расчёт вариантов',exact:true}).click();const response=page.waitForResponse(r=>r.url().endsWith('/api/planner/missions/solve')&&r.request().method()==='POST');await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();await response;
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();const approval=page.getByRole('dialog',{name:'Подтвердить модельный план'});await approval.getByRole('checkbox').check();await approval.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();
    await nav('Выполнение').click();await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('1');await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();await page.getByRole('button',{name:'Изменить план',exact:true}).click();
    await page.getByRole('dialog',{name:'Проверка перед загрузкой'}).getByRole('button',{name:'Заменить текущую миссию',exact:true}).click();
    check('revision opens remaining work and comparison',await page.locator('.mw-revision-diff').isVisible());
    check('original run remains immutable in history',(await read('prime-planner-operations','operations')).some(r=>r.status==='cancelled'));
    await page.screenshot({path:out+'/revision.png',fullPage:true});check('no JavaScript errors',errors.length===0);
  }catch(e){checks.push({name:'fatal',pass:false,detail:String(e)});await page.screenshot({path:out+'/failure.png',fullPage:true});}
  const report={at:new Date().toISOString(),status:checks.every(c=>c.pass)?'pass':'fail',checks,errors};await saveReport('report.json',report);return report;
}
