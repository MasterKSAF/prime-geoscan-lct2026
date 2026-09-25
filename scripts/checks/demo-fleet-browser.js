/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async(page)=>{
 const checks=[];const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name)};
 const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
 await nav('Парк БВС').click();
 const row=page.locator('.demo-fleet-row').first();
 await row.getByRole('button',{name:'Паспорт',exact:true}).click();
 await page.getByLabel('Паспорт PDF').setInputFiles('docs/references/track5-geoscan-original.pdf');
 await page.locator('iframe[title="Паспорт Геоскан Gemini"]').waitFor();
 check('PDF загружен локально и открыт для просмотра',(await page.locator('iframe[title="Паспорт Геоскан Gemini"]').getAttribute('src')).startsWith('blob:'));
 await page.screenshot({path:'output/playwright/demo-session/05-passport.png'});
 await page.getByRole('button',{name:'Закрыть парк'}).click();
 await row.getByRole('button',{name:'Доступность',exact:true}).click();
 const selected=page.getByRole('dialog').getByRole('checkbox').first();await selected.uncheck();check('доступность снимается',!await selected.isChecked());
 await page.getByRole('button',{name:'Закрыть парк'}).click();
 await nav('Миссии').click();await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Редактировать',exact:true}).click();await page.getByRole('button',{name:'Открыть в редакторе'}).click();
 let pending=page.waitForResponse(r=>r.url().endsWith('/api/planner/missions/solve')&&r.request().method()==='POST');await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();let result=await(await pending).json();
 check('отключённый парк не получает выполнимый план',result.candidates.every(c=>c.status!=='feasible_model'));
 await nav('Парк БВС').click();await row.getByRole('button',{name:'Доступность',exact:true}).click();await selected.check();await page.getByRole('button',{name:'Закрыть парк'}).click();
 await nav('Редактор').click();pending=page.waitForResponse(r=>r.url().endsWith('/api/planner/missions/solve')&&r.request().method()==='POST');await page.getByRole('button',{name:/^(Рассчитать варианты|Пересчитать)$/}).click();result=await(await pending).json();check('возврат доступности восстановил план',result.candidates.some(c=>c.status==='feasible_model'));
 await page.getByRole('button',{name:'Действия с этой миссией'}).click();check('в меню только загрузка и JSON',await page.getByRole('dialog').getByRole('button').count()===3);await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
 await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();await page.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();await page.getByRole('button',{name:'К выполнению',exact:true}).click();await page.getByRole('combobox',{name:'Скорость симуляции'}).selectOption('1');await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Идёт симуляция',{exact:true}).waitFor();
 await page.evaluate(()=>{window.confirm=()=>true;});
 await page.getByRole('button',{name:/Удалить из выполнения: Демо 1/}).click();await nav('Отчёт').click();await page.locator('.demo-reports tbody tr').first().getByText('Нет расчёта',{exact:true}).waitFor();check('активный запуск удалён и модельный полёт остановлен',await page.locator('.demo-reports tbody tr').first().getByText('Нет расчёта',{exact:true}).isVisible());
 return {checks};
}
