/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [], results = [];
  const check = (name, pass, detail) => { checks.push({name, pass: !!pass, detail}); if (!pass) throw Error(name); };
  page.on('pageerror', e => errors.push(e.message));
  const nav = name => page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const solve = async () => {
    const pending = page.waitForResponse(r => /\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) && r.request().method() === 'POST', {timeout:60000});
    await page.getByRole('button',{name:/^(Рассчитать варианты|Пересчитать)$/}).click();
    const res = await pending, r = await res.json(); check('API 0.3.7', res.ok() && r.engineVersion === '0.3.7'); return r;
  };
  try {
    await page.setViewportSize({width:1440,height:900});
    if(await page.locator('[data-scenario-id="demo-01-survey"]').isVisible()) {
      await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Редактировать',exact:true}).click();
      await page.getByRole('button',{name:'Открыть в редакторе',exact:true}).click();
    }
    await page.getByRole('button',{name:'Миссия',exact:true}).click();
    check('В редакторе есть лимит БВС и срок', await page.getByRole('combobox',{name:'Лимит БВС',exact:true}).isVisible() && await page.getByRole('textbox',{name:'Завершить миссию до',exact:true}).isVisible());
    for (const n of ['1','2','3']) {
      await page.getByRole('button',{name:'Миссия',exact:true}).click();
      await page.getByRole('combobox',{name:'Лимит БВС',exact:true}).selectOption(n);
      const r = await solve(); results.push({limit:Number(n), candidates:r.candidates.map(c=>({status:c.status,metrics:c.metrics})), study:r.resourceStudy});
      check(`Ограничение ${n} передано и соблюдено`,r.document.planning.maxVehicles===Number(n)&&r.candidates.every(c=>new Set(c.sorties.map(s=>s.vehicleId)).size<=Number(n)));
      check(`Демо 1, N=${n}: полный допустимый план`,r.candidates.every(c=>c.status==='feasible_model'));
      check('Новая политика срока, без 50/50', r.recommendation?.policy==='deadline-min-flight-v1' && r.recommendation.slackSec>=0);
    }
    for(const close of await page.getByRole('button',{name:/^Закрыть уведомление:/}).all()) if(await close.isVisible()) await close.click();
    await page.screenshot({path:'output/playwright/0.3.7-options.png'});
    await page.getByRole('button',{name:'Подробное сравнение',exact:true}).click();
    await page.getByText('Сколько БВС нужно к сроку',{exact:true}).click();
    check('Таблица ресурсов открывается',await page.getByRole('columnheader',{name:'Лимит группы',exact:true}).isVisible());
    await page.getByText('Из чего складывается налёт',{exact:true}).click();
    check('Налёт разложен на фазы',await page.getByText('Переходы и возврат',{exact:true}).isVisible());
    await page.screenshot({path:'output/playwright/0.3.7-resource-study.png'});
    await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
    await nav('Парк БВС').click();
    await page.getByRole('button',{name:'Доступность',exact:true}).first().click();
    const dialog=page.getByRole('dialog');
    await dialog.locator('.fleet-maintenance summary').first().click();
    const flights=dialog.getByRole('spinbutton',{name:/Наработка полётов:/}).first();
    await flights.fill('3');
    await dialog.getByRole('button',{name:'Сохранить наработку',exact:true}).first().click();
    await page.waitForTimeout(300);
    await dialog.locator('.fleet-maintenance summary').first().click();
    check('Счётчик ТО сохранён в общем парке',await dialog.getByRole('spinbutton',{name:/Наработка полётов:/}).first().inputValue()==='3');
    await page.screenshot({path:'output/playwright/0.3.7-maintenance.png'});
    await page.getByRole('button',{name:'Закрыть парк',exact:true}).click();
    check('Нет ошибок JavaScript', errors.length===0,errors);
  } catch(e) { checks.push({name:'Unexpected',pass:false,detail:String(e)}); await page.screenshot({path:'output/playwright/0.3.7-resources-error.png'}); }
  return {checks,errors,results};
}
