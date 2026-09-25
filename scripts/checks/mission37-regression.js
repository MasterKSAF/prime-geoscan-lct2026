/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks=[], errors=[];
  const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name);};
  page.on('pageerror',e=>errors.push(e.message));
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const open=async id=>{
    await nav('Миссии').click();
    await page.locator(`[data-scenario-id="${id}"]`).getByRole('button',{name:'Редактировать',exact:true}).click();
    await page.getByRole('button',{name:'Открыть в редакторе',exact:true}).click();
  };
  const solve=async()=>{
    const pending=page.waitForResponse(r=>/\/missions\/solve(?:-with-obstacles)?$/.test(r.url())&&r.request().method()==='POST',{timeout:60000});
    await page.getByRole('button',{name:/^(Рассчитать варианты|Пересчитать)$/}).click();
    const response=await pending, data=await response.json();
    check('API отвечает версией 0.3.7',response.ok()&&data.engineVersion==='0.3.7');return data;
  };
  const start=async()=>{
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();
    await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();
    await page.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();
    await page.getByRole('button',{name:'К выполнению',exact:true}).click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('100');
    await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();
  };
  const download=async(locator,file)=>{
    const pending=page.waitForEvent('download',{timeout:60000});await locator.click();await(await pending).saveAs(file);check('Выгрузка '+file,true);
  };
  try {
    await page.setViewportSize({width:1440,height:900});
    await open('demo-01-survey');
    let r=await solve();check('Демо 1: полные допустимые варианты',r.candidates.every(c=>c.status==='feasible_model'));
    await start();
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:60000});
    check('Демо 1: выполнена целиком',true);
    await page.screenshot({path:'output/playwright/0.3.7-demo1-completed.png'});
    await open('demo-02-expert-obstacles');r=await solve();
    check('Демо 2: препятствия, полный план',r.candidates.every(c=>c.status==='feasible_model'));
    const min=page.getByRole('button',{name:/Меньше налёт Выбрать вариант/});if(await min.isVisible())await min.click();
    await start();
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:60000});
    check('Демо 2: завершение без ложного аварийного события',true);
    await page.screenshot({path:'output/playwright/0.3.7-demo2-completed.png'});
    await nav('Отчёт').click();
    const row=page.locator('.demo-reports tbody tr').nth(1);
    check('Демо 2: отчёт 100%',(await row.innerText()).includes('100%'));
    await page.screenshot({path:'output/playwright/0.3.7-report.png'});
    for(const[name,file]of[
      ['Скачать доказательства:','output/playwright/0.3.7-demo2-evidence.zip'],
      ['Скачать проверки плана:','output/playwright/0.3.7-demo2-checks.json'],
      ['Скачать видео MP4:','output/playwright/0.3.7-demo2.mp4']])await download(row.getByRole('button',{name:new RegExp('^'+name)}),file);
    await row.getByRole('button',{name:/^Все проверки:/}).click();
    check('Из отчёта открываются проверки',await page.getByRole('heading',{name:'Все обязательные проверки пройдены',exact:true}).isVisible());
    await open('demo-03-repair');r=await solve();
    check('Демо 3: отказ не выдан за успех',r.candidates.every(c=>c.status!=='feasible_model'));
    check('Демо 3: запуск заблокирован',await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Все проверки',exact:true}).click();
    await page.screenshot({path:'output/playwright/0.3.7-demo3.png'});
    await nav('Отчёт').click();
    await page.getByRole('tablist',{name:'Разделы результатов'}).getByRole('tab',{name:'Все миссии',exact:true}).click();
    await download(page.locator('.demo-reports tbody tr').nth(2).getByRole('button',{name:/^Скачать доказательства:/}),'output/playwright/0.3.7-demo3-evidence.zip');
    check('Нет ошибок JavaScript',errors.length===0,errors);
  }catch(e){checks.push({name:'Unexpected',pass:false,detail:String(e)});await page.screenshot({path:'output/playwright/0.3.7-regression-error.png'});}
  return{checks,errors};
}
