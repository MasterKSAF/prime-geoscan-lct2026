/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks=[],errors=[],conversion=[],videoRequests=[];
  const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name);};
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  page.on('response',r=>{if(r.url().endsWith('/video/mp4'))conversion.push(r.status());});
  page.on('request',r=>{if(r.url().endsWith('/video/mp4'))videoRequests.push({event:'request',at:Date.now(),method:r.method(),contentType:r.headers()['content-type']});});
  page.on('requestfailed',r=>{if(r.url().endsWith('/video/mp4'))videoRequests.push({event:'requestfailed',at:Date.now(),error:r.failure()?.errorText});});
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(()=>{
    window.confirm=()=>true;
    const supported=MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported=t=>!t.startsWith('video/mp4')&&supported(t);
    window.__acceptanceVideoEvents=[];
    const NativeRecorder=window.MediaRecorder;
    window.MediaRecorder=new Proxy(NativeRecorder,{construct(Target,args){
      const recorder=Reflect.construct(Target,args);
      for(const name of ['start','dataavailable','error','stop'])recorder.addEventListener(name,event=>window.__acceptanceVideoEvents.push({event:name,at:performance.now(),state:recorder.state,mime:recorder.mimeType,bytes:event.data?.size,error:event.error?.message}));
      return recorder;
    }});
  });
  await page.goto(page.url().split('/planner')[0]+'/planner');
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const open=async id=>{await nav('Миссии').click();await page.locator(`[data-scenario-id="${id}"]`).getByRole('button',{name:'Редактировать',exact:true}).click();await page.getByRole('button',{name:'Открыть в редакторе',exact:true}).click();};
  const solve=async()=>{const p=page.waitForResponse(r=>/\/api\/planner\/missions\/solve(?:-with-obstacles)?$/.test(r.url())&&r.request().method()==='POST');await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();const r=await p;check('расчёт 200',r.status()===200);await page.getByRole('heading',{name:'Выберите подходящий план'}).waitFor();};
  try{
    await page.locator('.demo-mission-cards article').first().waitFor();await open('demo-01-survey');await solve();
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();await page.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();await page.getByRole('button',{name:'К выполнению',exact:true}).click();
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('100');await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();
    await page.getByRole('button',{name:'● Запись видео',exact:true}).waitFor();await nav('Отчёт').click();
    const first=page.locator('.demo-reports tbody tr').first();
    await first.getByText('Завершено',{exact:true}).waitFor({timeout:30000});check('миссия завершилась вне вкладки выполнения',true);
    const videoButton=first.getByRole('button',{name:/Скачать видео MP4:/});
    const dl=page.waitForEvent('download',{timeout:120000});await videoButton.waitFor();await videoButton.click();await(await dl).saveAs('output/playwright/release-webm-converted.mp4');
    check('WebM преобразован локальным сервисом',conversion.includes(200),conversion);
    await first.getByRole('button',{name:/Открыть отчёт:/}).click();await page.getByRole('dialog',{name:'Отчёт миссии'}).waitFor();
    const report=await page.frameLocator('iframe[title="Отчёт выполнения"]').locator('body').innerText();check('отчёт открыт внутри стенда',report.includes('Демо 1')&&report.length>1000);
    await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();check('закрытие отчёта вернуло таблицу',await first.isVisible());
    for(const theme of ['light','dark']){
      await page.getByRole('button',{name:'Настройки и справка',exact:true}).click();await page.getByRole('combobox',{name:'Тема интерфейса',exact:true}).selectOption(theme);await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
      await nav('Миссии').click();await page.locator('[data-scenario-id="demo-03-repair"]').getByRole('button',{name:'Редактировать',exact:true}).click();await page.getByRole('button',{name:'Открыть в редакторе',exact:true}).click();
      const contrast=await page.getByRole('button',{name:'Миссия',exact:true}).evaluate(el=>{
        const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
        const lum=a=>a.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        const style=getComputedStyle(el),a=lum(rgb(style.color)),b=lum(rgb(style.backgroundColor));return {fg:style.color,bg:style.backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      });check('контраст синего текста '+theme,contrast.ratio>=4.5,contrast);await page.screenshot({path:`output/playwright/release-contrast-${theme}.png`});
    }
    await solve();await page.getByRole('region',{name:'Сводка проверок плана'}).getByRole('button',{name:'Все проверки',exact:true}).click();
    await page.locator('summary').filter({hasText:/Что изменить, чтобы выполнить миссию/}).click();
    const trial=page.locator('.mi-cards article').filter({has:page.getByRole('heading',{name:/Заменить батарею:/})}).first();
    await trial.getByRole('button',{name:'Проверить вариант',exact:true}).click();await trial.getByText('С этими изменениями миссию можно выполнить в модели.',{exact:true}).waitFor({timeout:30000});check('исправление третьего сценария проверено через интерфейс',true);
    await page.setViewportSize({width:1024,height:768});await nav('Отчёт').click();check('нет переполнения на 1024px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('нет ошибок браузера',errors.length===0,errors);
  }catch(e){
    const notifications=page.getByRole('button',{name:/^Уведомления/});
    if(await notifications.count()&&!await page.locator('dialog[open]').count())await notifications.click().catch(()=>{});
    checks.push({name:'Unexpected',pass:false,error:String(e),body:await page.locator('body').innerText(),buttons:await page.locator('.demo-reports tbody tr').first().getByRole('button').evaluateAll(buttons=>buttons.map(b=>({text:b.textContent,disabled:b.disabled,title:b.title})))});
    await page.screenshot({path:'output/playwright/release-webm-error.png'});
  }
  return {checks,errors,conversion,videoRequests,videoEvents:await page.evaluate(()=>window.__acceptanceVideoEvents??[])};
}
