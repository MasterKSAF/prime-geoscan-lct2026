// Run ONLY in a fresh isolated playwright-cli session. Seeds synthetic archive records, never a user's profile.
async (page) => {
  const out = 'output/playwright/journal-notifications', checks = [], errors = [];
  const check = (name, pass, detail = '') => { checks.push({name, pass: !!pass, detail}); if (!pass) throw Error(`${name}: ${detail}`); };
  const nav = name => page.getByRole('tablist', {name:'Разделы стенда'}).getByRole('tab', {name, exact:true});
  const readStore = store => page.evaluate(async store => new Promise((resolve, reject) => {
    const request = indexedDB.open('prime-planner-operations', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db=request.result, tx=db.transaction(store,'readonly'), read=tx.objectStore(store).getAll();
      read.onsuccess=()=>resolve(read.result); tx.oncomplete=()=>db.close(); tx.onerror=()=>reject(tx.error);
    };
  }),store);
  const saveJSON = async (name, action) => {
    const pending=page.waitForEvent('download'); await action(); const file=await pending;
    await file.saveAs(`${out}/${name}`); let text=''; const stream=await file.createReadStream();
    for await(const chunk of stream) text+=chunk.toString(); return JSON.parse(text);
  };
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>void dialog.accept());
  try {
    await page.setViewportSize({width:1440,height:960});
    await page.getByRole('button',{name:'Создать миссию',exact:true}).waitFor();
    check('fresh isolated journal; no user records will be overwritten', (await readStore('operations')).length===0);
    const document = await (await page.request.get('http://127.0.0.1:3016/planner/scenarios/demo-01-survey.mission.json')).json();
    const response=await page.request.post('http://127.0.0.1:3016/api/planner/missions/solve',{data:document});
    check('fixture is calculated by real API',response.status()===200);
    const solved=await response.json();
    check('fixture route is verified feasible',solved.candidates[0].status==='feasible_model');
    const fixtures=await page.evaluate(async solved => {
      const normalize=value=>Array.isArray(value)?value.map(normalize):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,normalize(v)])):value;
      const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalize(value))))),b=>b.toString(16).padStart(2,'0')).join('');
      const createdAt=new Date().toISOString(); const rows=[];
      for(const [id,stale,active] of [['qa-good',false,false],['qa-old-completed',true,false],['qa-old-active',true,true]]) {
        const candidate=structuredClone(solved.candidates[0]);
        if(stale)candidate.events.at(-1).detail='Архивная формулировка предыдущего выпуска.';
        const planHash=await hash(candidate);
        const row={schemaVersion:'1.0',modelOnly:true,engineVersion:'0.3.0',id,revision:1,status:active?'paused':'completed',progressSec:active?0:candidate.metrics.makespanSec,createdAt,updatedAt:createdAt,startedAt:createdAt,finishedAt:active?null:createdAt,document:solved.document,candidate,approval:{inputHash:solved.inputHash,planHash,candidateId:candidate.id,approvedAt:createdAt},inputHash:solved.inputHash,planHash};
        rows.push({...row,integrityHash:await hash(row)});
      }
      await new Promise((resolve,reject)=>{
        const opening=indexedDB.open('prime-planner-operations',2);
        opening.onerror=()=>reject(opening.error);
        opening.onsuccess=()=>{const db=opening.result,tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations');for(const row of rows)store.add(row);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
      });
      return rows;
    },solved);
    const fleetBefore=await readStore('fleet-state');
    await page.reload();
    const toast=page.locator('[data-notification-id="journal-review"]');
    await toast.waitFor();
    check('one compact notification for two rejected rows',await toast.count()===1&&await page.locator('.mw-notification-card').count()===1);
    check('persistent full-width journal errors removed',await page.locator('.mw-alert.error').filter({hasText:/Снимок не прошёл|Журнал миссий/}).count()===0);
    const initial=await page.locator('.mh-home').boundingBox(), box=await toast.boundingBox();
    check('notification is top-right and at most 380px',box.width<=380&&box.x>=1440-405&&box.y<100,JSON.stringify(box));
    await page.screenshot({path:`${out}/01-notification.png`,fullPage:true});
    await toast.locator('button[aria-label^="Закрыть уведомление"]').waitFor();
    await toast.waitFor({state:'hidden',timeout:17000});
    const after=await page.locator('.mh-home').boundingBox();
    check('notification expiry does not shift layout',initial.y===after.y&&initial.height===after.height);
    check('triangle remains after 15-second expiry',await page.getByRole('button',{name:/^Уведомления/}).isVisible());
    await page.getByRole('button',{name:/^Уведомления/}).click();
    check('notification retained in history once',await page.locator('.mw-notification-history-item').count()===1);
    await page.getByRole('button',{name:'Проверить снимки',exact:true}).click();
    const review=page.getByRole('dialog',{name:'Проверка сохранённой истории',exact:true});
    const active=review.getByRole('article',{name:'Запись qa-old-active',exact:true});
    check('both quarantined records accessible',await review.locator('.mjr-record').count()===2);
    check('old active requires explicit stop confirmation',await active.getByRole('button',{name:'Зафиксировать остановку',exact:true}).isDisabled());
    const downloaded=await saveJSON('original-active.json',()=>active.getByRole('button',{name:'Скачать исходную запись',exact:true}).click());
    check('download preserves exact original record',JSON.stringify(downloaded)===JSON.stringify(fixtures[2]));
    await active.getByRole('checkbox').check();
    await active.getByRole('button',{name:'Зафиксировать остановку',exact:true}).click();
    await active.getByText('Остановлена и сохранена',{exact:true}).waitFor();
    const archived=(await readStore('operations')).find(row=>row.id==='qa-old-active');
    check('archive preserves original inside hash-checked wrapper',archived.recordType==='quarantined-mission-archive'&&JSON.stringify(archived.original)===JSON.stringify(fixtures[2]));
    check('archive never invents telemetry or charge',JSON.stringify(await readStore('fleet-state'))===JSON.stringify(fleetBefore));
    const modalToast=page.locator('[data-notification-id="workbench-notice"]');
    await modalToast.waitFor();
    check('notification is operable over native dialog',await modalToast.evaluate(node=>node.closest('dialog')?.open===true&&node.closest('[popover]')?.matches(':popover-open')));
    await modalToast.getByRole('button',{name:/Закрыть уведомление/}).click();
    check('X removes the notification immediately',await modalToast.count()===0);
    const remainingNotice=page.locator('[data-notification-id="journal-review"]');
    if(await remainingNotice.count()) await remainingNotice.getByRole('button',{name:/Закрыть уведомление/}).click();
    await page.screenshot({path:`${out}/02-preserved-archive.png`,fullPage:true});
    const old=review.getByRole('article',{name:'Запись qa-old-completed',exact:true});
    await old.getByRole('button',{name:'Открыть задание для пересчёта',exact:true}).click();
    const preview=page.getByRole('dialog',{name:'Проверка перед загрузкой',exact:true});
    await preview.waitFor();
    check('recovery opens a separate input preview',await preview.isVisible()&&(await preview.innerText()).includes('восстановлено'));
    await preview.getByText('Полное содержимое файла',{exact:true}).click();
    const recovered=JSON.parse(await preview.locator('pre').last().innerText());
    check('recovered task gets a new mission ID without altering inputs',recovered.id!==document.id&&JSON.stringify(recovered.scenario)===JSON.stringify(solved.document.scenario));
    await preview.getByRole('button',{name:'Заменить текущее задание',exact:true}).click();
    check('recovery opens editor, not old execution',await nav('Редактор').getAttribute('aria-selected')==='true');
    check('recovery has no inherited approval',await page.getByRole('button',{name:'План подтверждён',exact:true}).count()===0);
    await nav('Миссии').click();
    const home=page.getByRole('region',{name:'Задания и выполнения'});
    await home.getByRole('tab',{name:/^История/}).click();
    check('healthy completed mission stays visible despite old snapshots',await home.locator('.mo-run:visible').count()===1);
    check('archive records remain reachable from history',await home.getByRole('button',{name:'Старые снимки · 2',exact:true}).isVisible());
    const records=await readStore('operations');
    check('no journal rows deleted',records.length===3);
    check('healthy and old completed records unchanged',JSON.stringify(records.find(row=>row.id==='qa-good'))===JSON.stringify(fixtures[0])&&JSON.stringify(records.find(row=>row.id==='qa-old-completed'))===JSON.stringify(fixtures[1]));
    check('dismissed archive toast is not replayed by tab changes',await page.locator('[data-notification-id="journal-review"]').count()===0);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:/^Уведомления/}).click();
    check('mobile notification history has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${out}/03-mobile-notifications.png`,fullPage:true});
    check('no unhandled browser errors',errors.length===0,errors.join('\n'));
  } catch(error) {checks.push({name:'fatal',pass:false,detail:String(error)});await page.screenshot({path:`${out}/failure.png`,fullPage:true});}
  const report={at:new Date().toISOString(),checks,errors};
  await saveJSON('browser-report.json',()=>page.evaluate(report=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.href=url;a.download='browser-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report));
  return report;
}
