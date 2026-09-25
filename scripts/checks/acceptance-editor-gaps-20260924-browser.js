/* oxlint-disable no-unused-expressions -- Isolated Playwright acceptance callback. */
async (page) => {
  const checks=[],errors=[];
  const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name);};
  const b=name=>page.getByRole('button',{name,exact:true});
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const openDetails=async selector=>{const d=page.locator(selector);if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();};
  const download=async(button,name)=>{const pending=page.waitForEvent('download',{timeout:60000});await button.click();const d=await pending;if(name)await d.saveAs(`output/playwright/${name}`);const stream=await d.createReadStream();const chunks=[];let size=0;for await(const chunk of stream){chunks.push(chunk);size+=chunk.length;}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;};
  const read=async()=>{await openDetails('.mission-data-panel');const bytes=await download(b('Скачать данные миссии JSON'));return page.evaluate(data=>JSON.parse(new TextDecoder().decode(new Uint8Array(data))),Array.from(bytes));};
  const open=async id=>{await nav('Миссии').click();await page.locator(`[data-scenario-id="${id}"]`).getByRole('button',{name:/^Редактировать/}).click();await b('Открыть в редакторе').click();};
  const solve=async()=>{const waiting=page.waitForResponse(r=>r.url().includes('/missions/solve')&&r.request().method()==='POST',{timeout:60000});await b('Рассчитать варианты').click();const response=await waiting;check('Calculation responds successfully',response.ok());const data=await response.json();await b('Проверить и подтвердить').waitFor();return data;};
  const approve=async()=>{await b('Проверить и подтвердить').click();await page.getByRole('dialog',{name:'Подтвердить модельный план'}).getByRole('checkbox').check();await b('Подтвердить для симуляции').click();await b('К выполнению').waitFor();};
  const workTab=async name=>{await openDetails('.me-works');await page.getByRole('tablist',{name:'Параметры выбранной работы'}).getByRole('tab',{name,exact:true}).click();};
  const zipJson=(data,name)=>page.evaluate(({data,name})=>{const bytes=new Uint8Array(data);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=0;while(p+30<=bytes.length&&view.getUint32(p,true)===0x04034b50){const compression=view.getUint16(p+8,true),size=view.getUint32(p+18,true),n=view.getUint16(p+26,true),e=view.getUint16(p+28,true);const label=new TextDecoder().decode(bytes.subarray(p+30,p+30+n));const start=p+30+n+e;if(label===name){if(compression!==0)throw Error('Expected stored ZIP evidence');return JSON.parse(new TextDecoder().decode(bytes.subarray(start,start+size)));}p=start+size;}throw Error('Missing ZIP entry '+name);},{data:Array.from(data),name});
  page.on('pageerror',e=>errors.push(e.message));
  try {
  await page.setViewportSize({width:1440,height:960});
  await page.evaluate(()=>{window.confirm=()=>true;});
  await open('demo-01-survey');
  const original=await read();
  await workTab('Участки');await b('Добавить участок').click();
  check('Adding a work area creates a separate draft',await page.locator('.mt-area-row').count()===2);
  const map=await page.getByRole('region',{name:'Карта полётной миссии',exact:true}).boundingBox();
  for(const [x,y] of [[0.45,0.35],[0.55,0.35],[0.55,0.45],[0.45,0.45]])await page.mouse.click(map.x+map.width*x,map.y+map.height*y);
  await b('Применить контур').click();
  const drawn=await read();const added=drawn.jobs.find(j=>j.id!==original.jobs[0].id);const ring=added.area.coordinates[0];
  check('Mouse-drawn work area closes without changing original area',ring.length===5&&JSON.stringify(ring[0])===JSON.stringify(ring.at(-1))&&JSON.stringify(drawn.jobs[0].area)===JSON.stringify(original.jobs[0].area));
  await page.locator('.mt-area-row[data-selected=true]').getByRole('button',{name:/^Действия с участком/}).click();await page.getByRole('textbox',{name:'Новое название участка',exact:true}).fill('Контрольный участок');await b('Переименовать').click();
  check('Work area rename is exported', (await read()).jobs.some(j=>j.id===added.id&&j.name==='Контрольный участок'));
  await page.locator('.mt-area-row[data-selected=true] .mt-area-item').click();
  const vertex=page.locator('.mission-area-vertex').first();await vertex.waitFor();const v=await vertex.boundingBox();await page.mouse.move(v.x+v.width/2,v.y+v.height/2);await page.mouse.down();await page.mouse.move(v.x+v.width/2+7,v.y+v.height/2+4,{steps:8});await page.mouse.up();
  check('Work area vertex drag changes saved geometry',JSON.stringify((await read()).jobs.find(j=>j.id===added.id).area)!==JSON.stringify(added.area));
  await page.locator('.mt-editor').getByRole('button',{name:'Сохранить изменения',exact:true}).click();
  await b('Удалить участок').click();
  const restored=await read();check('Deleting the added work area preserves original work',restored.jobs.length===1&&JSON.stringify(restored.jobs[0].area)===JSON.stringify(original.jobs[0].area));
  await workTab('Качество');
  await page.getByRole('combobox',{name:'Расчёт высоты',exact:true}).selectOption('gsd');await page.getByRole('spinbutton',{name:/^Детализация снимков/}).fill('3');
  check('GSD mode derives a bounded read-only height',await page.getByRole('spinbutton',{name:/^Высота съёмки/}).isDisabled()&&Number(await page.getByRole('spinbutton',{name:/^Высота съёмки/}).inputValue())<150);
  const byGsd=await solve();check('GSD mission has a feasible rechecked plan',byGsd.candidates.some(c=>c.status==='feasible_model')&&byGsd.document.jobs[0].quality.altitudeMode==='gsd');await approve();
  await b('Миссия').click();await workTab('Качество');await page.getByRole('combobox',{name:'Расчёт высоты',exact:true}).selectOption('fixed');await page.getByRole('spinbutton',{name:/^Детализация снимков/}).fill('5');await page.getByRole('spinbutton',{name:/^Высота съёмки/}).fill('100');
  await nav('Выполнение').click();check('Changed input cannot execute a stale approval',await b('Рассчитать план').isVisible()&&await b('Выполнить миссию').count()===0);await nav('Редактор').click();
  let revised=await solve();check('Fixed 100m with compatible 5cm GSD changes the approved input hash',revised.inputHash!==byGsd.inputHash&&revised.document.jobs[0].job.altitudeM===100&&revised.document.jobs[0].quality.maximumGsdCm===5);
  let second=revised.candidates[1];check('Second criterion is feasible',second?.status==='feasible_model');
  await page.locator(`[data-candidate-id="${second.id}"] .mw-plan-select`).click();check('Second criterion can be selected',await page.locator(`[data-candidate-id="${second.id}"] .mw-plan-select`).getAttribute('aria-pressed')==='true');
  await approve();await b('К выполнению').click();await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('1');await b('Выполнить миссию').click();await b('Пауза').waitFor({timeout:60000});
  await page.evaluate(()=>{window.confirm=()=>false;});await b('Удалить').click();check('Cancelling active-run deletion keeps the model running',await b('Пауза').isVisible());
  await page.evaluate(()=>{window.confirm=()=>true;});await b('Удалить').click();await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Редактировать',exact:true}).waitFor();check('Deleting active demo execution preserves its mission card',await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Выполнение',exact:true}).count()===0);
  await open('demo-01-survey');revised=await solve();second=revised.candidates[1];check('Disposed model execution releases resources for a new calculation',second?.status==='feasible_model');await page.locator(`[data-candidate-id="${second.id}"] .mw-plan-select`).click();
  await approve();await b('К выполнению').click();await page.getByRole('combobox',{name:'Скорость симуляции',exact:true}).selectOption('300');await b('Выполнить миссию').click();await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).waitFor({timeout:60000});check('A new run can finish after active demo disposal',true);
  await b('Отчёт миссии').click();const row=page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').first();
  const zip=await download(row.getByRole('button',{name:/^Скачать доказательства:/}),'editor-gaps-second-candidate.evidence.zip');const exportedCandidate=await zipJson(zip,'data/plan/candidate.json');
  check('Evidence ZIP belongs to the selected second candidate',exportedCandidate.id===second.id&&exportedCandidate.objective===second.objective&&exportedCandidate.plan.inputHash===revised.inputHash);
  await nav('Выполнение').click();await page.evaluate(()=>{window.confirm=()=>false;});await b('Удалить').click();check('Cancelling completed-run deletion keeps its journal and state',await page.getByRole('region',{name:'Модельная симуляция'}).getByText('Миссия завершена',{exact:true}).isVisible());
  await page.evaluate(()=>{window.confirm=()=>true;});await b('Удалить').click();await nav('Миссии').waitFor();await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Редактировать',exact:true}).waitFor();check('Deleting completed execution leaves its original mission card',await page.locator('[data-scenario-id="demo-01-survey"]').getByRole('button',{name:'Выполнение',exact:true}).count()===0);
  await open('demo-03-repair');const refused=await solve();check('Third scenario remains non-executable',refused.candidates.every(c=>c.status!=='feasible_model')&&await b('Проверить и подтвердить').isDisabled());
  await nav('Отчёт').click();await page.getByRole('region',{name:'Отчёты миссий'}).locator('tbody tr').filter({hasText:'Недостаточный заряд'}).getByRole('button',{name:/Все проверки:/}).click();
  const failures=page.getByRole('region',{name:'Непройденные проверки',exact:true});await failures.waitFor();
  check('Report opens failed checks with visible explanations, not collapsed details',await failures.locator('.mission-failure-detail').count()>0&&await failures.locator('.mission-failure-detail p').first().isVisible());
  await page.screenshot({path:'output/playwright/editor-gaps-failed-checks.png'});
  check('No unhandled browser exceptions',errors.length===0,errors);
  return {checks,errors,inputHash:revised.inputHash,candidateId:second.id,scope:['Active deletion disposes a demo run and its owned mock resource state; it is not a physical landing or remote abort command. Other drawing shape variants are not claimed.']};
  } finally {
    await page.evaluate(report=>{window.__queueReport=report;},{checks,errors});
  }
}
