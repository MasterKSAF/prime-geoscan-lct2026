/* eslint-disable no-unused-expressions -- Playwright CLI invokes this callback expression. */
/* Use a separate test session, never the user's browser profile. */
async (page) => {
  const out = 'output/playwright/expert-review', checks = [], errors = [], downloads = [];
  const check = (name, pass, detail = '') => { checks.push({name, pass: !!pass, detail}); if(!pass) throw Error(`${name}: ${detail}`); };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  const nav = (name) => page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const saveDownload = async (name, action) => { const pending = page.waitForEvent('download',{timeout:30000}); await action(); const download=await pending; await download.saveAs(`${out}/${name}`); downloads.push(name); return download; };
  const mapRight = async (name) => {
    const map = await page.locator('.mw-map-wrap').boundingBox();
    const panel = await page.locator('.mw-sidebar:visible, .mw-inspector:visible').first().boundingBox();
    check(`${name}: карта справа, панели слева`,!!map && !!panel && map.x > panel.x && Math.abs(map.y-panel.y)<3, JSON.stringify({map,panel}));
    check(`${name}: ширина карты около половины экрана`,!!map && map.width / page.viewportSize().width > .43 && map.width / page.viewportSize().width < .55);
  };
  const openDemo = async (id) => {
    await nav('Миссии').click();
    await page.getByRole('region',{name:'Три сценария проверки'}).locator(`[data-scenario-id="${id}"]`).click();
    await page.getByRole('button',{name:'Заменить текущую миссию',exact:true}).click();
    await mapRight(`${id}: редактор`);
  };
  const solve = async (id) => {
    const pending=page.waitForResponse(r=>/\/api\/planner\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) && r.request().method()==='POST',{timeout:30000});
    await page.getByRole('button',{name:'Рассчитать варианты',exact:true}).click();
    const response=await pending; check(`${id}: расчёт HTTP 200`,response.status()===200);
    const result=await response.json();
    await page.getByRole('heading',{name:'Выберите подходящий план',exact:true}).waitFor();
    await mapRight(`${id}: варианты`); return result;
  };
  const complete = async (id) => {
    await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).click();
    await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();
    await page.getByRole('button',{name:'Подтвердить для симуляции',exact:true}).click();
    await page.getByRole('button',{name:'К выполнению',exact:true}).click();
    await mapRight(`${id}: выполнение`);
    await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('100');
    await page.getByRole('button',{name:'Выполнить миссию',exact:true}).click();
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Идёт симуляция',{exact:true}).waitFor({timeout:15000});
    await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Время симуляции"]')?.value)>100,null,{timeout:15000});
    await page.screenshot({path:`${out}/${id}-execution.png`});
    await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:45000});
    check(`${id}: завершение получено из симуляции`,true);
    await nav('Отчёт').click();
    await page.getByText('Выполнение завершено в модели',{exact:true}).waitFor();
    check(`${id}: отчёт различает план и завершённый запуск`, await page.getByRole('region',{name:'Отчёт для проверки'}).isVisible());
    check(`${id}: неизвестные проверки не скрыты`, await page.locator('.expert-check-status.unknown:visible').count()>0);
    await page.screenshot({path:`${out}/${id}-report.png`});
    await saveDownload(`${id}.evidence.zip`,()=>page.getByRole('button',{name:'Скачать доказательства ZIP',exact:true}).click());
  };
  try {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(page.url().split('/planner')[0] + '/planner', {waitUntil:'domcontentloaded'});
    await nav('Миссии').waitFor();
    check('три примера доступны с первого экрана',await page.locator('.expert-demo').count()===3);
    await page.screenshot({path:`${out}/missions.png`});
    await openDemo('demo-01-survey');
    await page.getByRole('tab',{name:'Качество',exact:true}).click();
    check('технический профиль скрыт до раскрытия',!await page.getByText('Источник параметров сенсора',{exact:true}).isVisible());
    await page.getByRole('tab',{name:'Качество',exact:true}).press('ArrowRight');
    check('вкладки работают с клавиатуры',await page.getByRole('tablist',{name:'Параметры выбранной работы'}).getByRole('tab',{name:'БВС',exact:true}).getAttribute('aria-selected')==='true');
    await page.getByRole('tab',{name:'Участки',exact:true}).click();
    await page.getByRole('button',{name:'Развернуть карту',exact:true}).click();
    check('фокус-режим расширяет карту', (await page.locator('.mw-map-wrap').boundingBox()).width>1200);
    await page.getByRole('button',{name:'Вернуть панели',exact:true}).click();
    await mapRight('возврат из фокус-режима');
    await page.getByText('Период и правила всей миссии',{exact:false}).first().click();
    check('дата выбирается календарём',await page.getByLabel('Начало миссии',{exact:true}).getAttribute('type')==='datetime-local');
    check('часовой пояс выбирается из списка',await page.getByRole('combobox',{name:'Часовой пояс миссии'}).isVisible());
    await page.getByText('Период и правила всей миссии',{exact:false}).first().click();
    await page.screenshot({path:`${out}/editor.png`});
    await solve('demo-01-survey');
    await page.screenshot({path:`${out}/calculation.png`});
    await complete('demo-01-survey');
    await openDemo('demo-02-expert-obstacles');
    const second=await solve('demo-02-expert-obstacles');
    check('Демо 2 после первого демо остаётся выполнимым',second.candidates.some(c=>c.status==='feasible_model'));
    check('Демо 2 не включает БВС другого региона',second.document.scenario.vehicles.every(v=>['demo-rgb','demo-ms'].includes(v.id)));
    check('Демо 2 использует слой экспертов',!!second.document.obstacleLayer);
    const secondCount=await page.locator('[data-candidate-id]').count();
    check('Демо 2: реальные варианты, меньше трёх объяснено',secondCount>0&&secondCount<=3&&(secondCount===3||await page.locator('.mw-alternative-reason').isVisible()));
    await complete('demo-02-expert-obstacles');
    await openDemo('demo-03-repair');
    const third=await solve('demo-03-repair');
    check('Демо 3 не объявлен выполнимым',third.candidates.every(c=>c.status!=='feasible_model'));
    check('Демо 3: запуск заблокирован',await page.getByRole('button',{name:'Проверить и подтвердить',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Что изменить для выполнения',exact:true}).click();
    check('объяснение отказа доступно',await page.getByRole('heading',{name:'Проверки и объяснение решения',exact:true}).isVisible());
    await page.getByRole('tab',{name:'Итог',exact:true}).click();
    await saveDownload('demo-03-repair.diagnostic.zip',()=>page.getByRole('button',{name:'Скачать доказательства ZIP',exact:true}).click());
    await page.screenshot({path:`${out}/diagnostic.png`});
    check('на экране не больше одного уведомления',await page.locator('.mw-notification-card:visible').count()<=1);
    await page.setViewportSize({width:1024,height:768});
    await nav('Редактор').click(); await mapRight('ноутбук 1024×768');
    check('нет горизонтального переполнения',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole('button',{name:'Нарисовать область работ',exact:true}).click();
    check('рисование из расчёта открывает редактор',await page.getByRole('tablist',{name:'Параметры выбранной работы'}).isVisible());
    await page.getByRole('button',{name:'Развернуть карту',exact:true}).click();
    check('фокус-режим сохраняет кнопки завершения и отмены контура',await page.locator('.expert-drawing-actions').isVisible());
    check('пустой контур нельзя применить',await page.getByRole('button',{name:'Применить контур',exact:true}).isDisabled());
    await page.locator('.expert-drawing-actions').getByRole('button',{name:'Отмена',exact:true}).click();
    await page.getByRole('button',{name:'Вернуть панели',exact:true}).click();
    await mapRight('после отмены рисования');
    check('нет необработанных ошибок браузера', errors.length===0,errors.join('\n'));
  } catch(e) { checks.push({name:'fatal',pass:false,detail:String(e)}); await page.screenshot({path:`${out}/failure.png`,fullPage:true}); }
  const report={at:new Date().toISOString(),url:page.url(),modelOnly:true,checks,errors,downloads,status:checks.every(c=>c.pass)?'pass':'fail'};
  await saveDownload('browser-report.json',()=>page.evaluate((data)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='browser-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},report));
  return report;
}
