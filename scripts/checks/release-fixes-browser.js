/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks=[],errors=[]; const check=(name,pass)=>{checks.push({name,pass:!!pass});if(!pass)throw Error(name);};
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900}); await page.evaluate(()=>{window.confirm=()=>true;});
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const back=()=>page.getByRole('button',{name:'Назад',exact:true}).click();
  const open=async id=>{await nav('Миссии').click();await page.locator(`[data-scenario-id="${id}"]`).getByRole('button',{name:'Редактировать',exact:true}).click();await page.getByRole('button',{name:'Открыть в редакторе',exact:true}).click();};
  const solve=async()=>{const p=page.waitForResponse(r=>/\/api\/planner\/missions\/solve(?:-with-obstacles)?$/.test(r.url())&&r.request().method()==='POST',{timeout:60000});await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();const r=await p;check('расчёт 200',r.status()===200);await page.getByRole('heading',{name:'Выберите подходящий план'}).waitFor();return r.json();};
  try {
    await page.locator('.demo-mission-cards article').first().waitFor();
    await open('demo-01-survey');
    const name=page.getByRole('textbox',{name:'Название миссии',exact:true}),original=await name.inputValue();
    await name.fill('Проверка отмены');await page.getByRole('button',{name:'Отменить изменение',exact:true}).click();
    check('отмена вернула название',await name.inputValue()===original);
    await page.getByRole('button',{name:'Повторить изменение',exact:true}).click();check('повтор вернул правку',await name.inputValue()==='Проверка отмены');
    await page.getByRole('button',{name:'Отменить изменение',exact:true}).click();
    await nav('Отчёт').click(); await back();check('из отчёта вернулись в редактор',await nav('Редактор').getAttribute('aria-selected')==='true');
    const r=await solve();check('в первом сценарии три разных плана',await page.locator('[data-candidate-id]').count()===3);
    await page.getByRole('region',{name:'Сводка проверок плана'}).getByRole('button',{name:'Все проверки',exact:true}).click();
    await back();check('из проверок вернулись к вариантам',await page.getByRole('heading',{name:'Выберите подходящий план'}).isVisible());
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();
    await page.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();await page.getByRole('button',{name:'К выполнению',exact:true}).click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('40');await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();
    await page.getByRole('button',{name:'● Запись видео',exact:true}).waitFor({timeout:15000});check('запись началась автоматически',true);
    const s=r.candidates[0].sorties[0].segments.find(s=>s.phase==='survey');
    await page.waitForFunction(t=>Number(document.querySelector('input[aria-label="Время симуляции"]').value)>t,s.startSec+4,{timeout:15000});
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('10');
    await page.locator('.mw-safety-console summary').first().click();
    await page.getByRole('combobox',{name:'Событие',exact:true}).selectOption('wind');await page.getByRole('spinbutton',{name:'Ветер события',exact:true}).fill('4');
    const detected=Date.now();await page.getByRole('button',{name:'Внести событие',exact:true}).click();
    await page.locator('.mw-safety-heading').getByText('Возврат группы',{exact:true}).waitFor({timeout:12000});
    check('ветер вызвал реальный возврат за 12 с',Date.now()-detected<12000);
    await nav('Отчёт').click();await back();check('назад во время возврата не отменяет его',await page.locator('.mw-safety-heading').getByText('Возврат группы',{exact:true}).isVisible());
    await page.getByRole('combobox',{name:'Скорость возврата',exact:true}).selectOption('100');
    await page.locator('.mw-safety-heading').getByText('Возврат завершён',{exact:true}).waitFor({timeout:30000});
    check('группа вернулась',true);
    await page.getByRole('button',{name:'Закрыть выполнение',exact:true}).click();
    await page.screenshot({path:'output/playwright/release-fixes-return.png'});
    await page.getByRole('button',{name:'Скачать MP4',exact:true}).waitFor({timeout:10000});
    await nav('Отчёт').click();
    const video=page.waitForEvent('download',{timeout:120000});await page.locator('.demo-reports tbody tr').first().getByRole('button',{name:/Скачать видео MP4:/}).click();
    await(await video).saveAs('output/playwright/release-fixes-return.mp4');check('MP4 скачан',true);
    const archive=page.waitForEvent('download');await page.locator('.demo-reports tbody tr').first().getByRole('button',{name:/Скачать доказательства:/}).click();
    await(await archive).saveAs('output/playwright/release-fixes-return.zip');check('архив прерванной миссии скачан',true);
    await open('demo-02-expert-obstacles');await solve();
    const secondCount=await page.locator('[data-candidate-id]').count();
    check('планы второго сценария показаны без искусственных дублей',secondCount>0&&secondCount<=3);
    check('если вариантов меньше трёх, есть объяснение',secondCount===3||await page.locator('.mw-alternative-reason').isVisible());
    await open('demo-03-repair');await solve();
    check('третий сценарий блокирует запуск',await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).isDisabled());
    await page.getByRole('region',{name:'Сводка проверок плана'}).getByRole('button',{name:'Все проверки',exact:true}).click();
    await page.locator('summary').filter({hasText:/Что изменить, чтобы выполнить миссию/}).click();
    check('третий сценарий предлагает проверяемые исправления',await page.getByRole('button',{name:'Проверить вариант',exact:true}).count()>0);
    check('нет ошибок браузера',errors.length===0);
  }catch(e){checks.push({name:'Unexpected',pass:false,error:String(e)});await page.screenshot({path:'output/playwright/release-fixes-error.png'});}
  return {checks,errors};
}
