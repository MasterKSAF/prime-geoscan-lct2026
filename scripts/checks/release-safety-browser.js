/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks=[],errors=[];const check=(name,pass)=>{checks.push({name,pass:!!pass});if(!pass)throw Error(name);};
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1440,height:900});
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const begin=async()=>{
    await page.locator('.demo-mission-cards article').first().waitFor();
    await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Редактировать',exact:true}).click();await page.getByRole('button',{name:'Открыть в редакторе',exact:true}).click();
    const pending=page.waitForResponse(r=>r.url().endsWith('/missions/solve')&&r.request().method()==='POST');await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();const data=await(await pending).json();
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();await page.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();await page.getByRole('button',{name:'К выполнению',exact:true}).click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('40');await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();
    const s=data.candidates[0].sorties[0].segments.find(s=>s.phase==='survey');await page.waitForFunction(t=>Number(document.querySelector('input[aria-label="Время симуляции"]').value)>t,s.startSec+3,{timeout:15000});
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('1');await page.locator('.mw-safety-console summary').first().click();
  };
  try{
    if (!page.url().includes('test=sensor')) {
    await begin();await page.getByRole('combobox',{name:'Событие',exact:true}).selectOption('wind');await page.getByRole('spinbutton',{name:'Ветер события',exact:true}).fill('20');await page.getByRole('button',{name:'Внести событие',exact:true}).click();
    await page.locator('.mw-safety-heading').getByText('Автовозврат невозможен',{exact:true}).waitFor({timeout:15000});
    check('экстремальный ветер: явная причина, не зависание',(await page.getByRole('region',{name:'Защитный контур'}).innerText()).includes('предел'));
    await nav('Отчёт').click();check('интерфейс отвечает после критического события',await page.getByRole('heading',{name:'Отчёты миссий'}).isVisible());
    await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByRole('button',{name:'Скачать MP4',exact:true}).waitFor();
    check('отказной сценарий тоже заканчивает видеозапись',true);await page.screenshot({path:'output/playwright/release-wind-blocked.png'});
    } else {
    await begin();await page.getByRole('combobox',{name:'Событие',exact:true}).selectOption('sensor');await page.getByRole('button',{name:'Внести событие',exact:true}).click();
    await page.locator('.mw-safety-heading').getByText(/Решение:/).waitFor();check('отказ сенсора: предлагается выбор оператора',await page.getByRole('button',{name:/Вернуться/}).count()>0);
    await nav('Отчёт').click();
    await page.locator('.demo-reports tbody tr').first().getByText('Возврат',{exact:true}).waitFor({timeout:68000});check('после минуты возврат включился вне экрана миссии',true);
    await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByRole('combobox',{name:'Скорость возврата',exact:true}).selectOption('100');await page.locator('.mw-safety-heading').getByText('Возврат завершён',{exact:true}).waitFor({timeout:20000});check('возврат после тайм-аута завершился посадкой',true);
    }
    check('нет ошибок браузера',errors.length===0);
  }catch(e){checks.push({name:'Unexpected',pass:false,error:String(e)});await page.screenshot({path:'output/playwright/release-safety-error.png'});}
  return {checks,errors};
}
