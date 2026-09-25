/* oxlint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks=[],errors=[];
  const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(`${name}: ${JSON.stringify(detail)}`);};
  const button=name=>page.getByRole('button',{name,exact:true});
  const nav=name=>page.getByRole('tablist',{name:'Разделы стенда'}).getByRole('tab',{name,exact:true});
  const err=e=>errors.push(e.message);
  page.on('pageerror',err);
  const ensureOpen=async(selector)=>{const element=page.locator(selector);if(!(await element.getAttribute('open')!==null))await element.locator(':scope > summary').click();};
  const read=async()=>{
    const promise=page.waitForEvent('download');await button('Скачать данные миссии JSON').click();
    const stream=await(await promise).createReadStream();stream.setEncoding('utf8');let text='';for await(const chunk of stream)text+=chunk;return JSON.parse(text);
  };
  const objects=async()=>{
    await ensureOpen('.mission-data-panel');
    await ensureOpen('.mission-catalog-imports');
  };
  const drag=async(marker)=>{
    const box=await marker.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+24,box.y+box.height/2,{steps:12});await page.mouse.up();
    await page.locator('.base-map-feedback').waitFor();
  };
  try {
    await page.setViewportSize({width:1440,height:960});
    // Run only in an isolated CLI profile. Prior flights consume the shared fleet's battery;
    // this geometry fixture requires a fresh fleet, not a historical demo template.
    await button('Настройки и справка').click();
    await page.evaluate(()=>{window.__airspaceConfirm=window.confirm;window.confirm=()=>true;});
    try { await button('Начать с нуля').click(); }
    finally { await page.evaluate(()=>{window.confirm=window.__airspaceConfirm;delete window.__airspaceConfirm;}); }
    await nav('Миссии').click();
    await page.getByRole('region',{name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).first().click();
    await button('Открыть в редакторе').click();
    await objects();
    const original=await read();
    const ring=original.scenario.airspace.coordinates[0].map(p=>p.join(',')).join(' ');
    const importZone=async(altitudes,time='')=>{
      const xml=`<kml><Placemark><name>Проверочная зона</name><ExtendedData><Data name="Altitudes"><value>${altitudes}</value></Data><Data name="Type"><value>врем_ограничение</value></Data></ExtendedData>${time}<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
      await page.getByLabel('Каталог зон KML',{exact:true}).evaluate((input,file)=>{
        const transfer=new DataTransfer();
        transfer.items.add(new File([file.text],file.name,{type:'application/vnd.google-earth.kml+xml'}));
        input.files=transfer.files;
        input.dispatchEvent(new Event('change',{bubbles:true}));
      },{name:'airspace-browser-test.kml',text:xml});
      await button('Применить зоны').click();
      await ensureOpen('.airspace-layer-details');
      return xml;
    };
    const xml=await importZone('От FL100 до FL980');
    check('Imported altitude layer is visible with original range',await page.getByLabel('Ограничения в области миссии').getByText('От FL100 до FL980',{exact:true}).isVisible());
    check('Unknown schedule is not called permanent',await page.getByLabel('Ограничения в области миссии').getByText('Расписания нет · учитывается весь период',{exact:true}).isVisible());
    check('Standard atmosphere explicitly labelled a model',await page.getByLabel('Модель пересчёта FL').inputValue()==='standard-atmosphere');
    check('Full KML source survives mission export',(await read()).catalogLayers.find(s=>s.role==='restrictions').sourceText===xml);
    await page.locator('.airspace-layer-details').scrollIntoViewIfNeeded();
    await page.screenshot({path:'output/playwright/airspace-high-layer-20260924.png'});
    const baseId=await page.locator('.mission-base-icon').first().getAttribute('data-base-id');
    const marker=()=>page.locator(`[data-base-id="${baseId}"]`);
    const before=await read();
    await drag(marker());
    const moved=await read();
    const coord=d=>d.bases?.find(b=>b.id===baseId)?.coordinate ?? d.scenario.vehicles[0].start;
    check('Actual map drag under high FL layer applies',JSON.stringify(coord(moved))!==JSON.stringify(coord(before)));
    check('Map drag leaves battery state unchanged',JSON.stringify(moved.batteries)===JSON.stringify(before.batteries));
    await objects();await ensureOpen('.airspace-layer-details');
    await page.getByLabel('Модель пересчёта FL').selectOption('unknown');
    const unknown=await read();
    check('Unknown pressure reference round-trips explicitly',unknown.airspaceAltitudeReference.kind==='unknown');
    const old=JSON.stringify(coord(unknown));
    if(await page.locator('.base-map-feedback button[aria-label]').count())await page.locator('.base-map-feedback button[aria-label]').last().click();
    await drag(marker());
    check('Unresolved altitude datum rejects unsafe drag',JSON.stringify(coord(await read()))===old);
    check('Rejected drag presents a ground-restriction reason',(await page.locator('.base-map-feedback').innerText()).includes('ограничения у земли'));
    await ensureOpen('.airspace-layer-details');
    await page.getByLabel('Модель пересчёта FL').selectOption('standard-atmosphere');
    const response=page.waitForResponse(r=>r.url().includes('/missions/solve') && r.request().method()==='POST',{timeout:60000});
    await button('Рассчитать варианты').click();
    const result=await(await response).json();
    check('High zone allows a fully calculated plan',result.candidates?.some(c=>c.status==='feasible_model'),result.candidates?.map(c=>c.status));
    check('High-zone plan passes 4D checks',result.candidates?.filter(c=>c.status==='feasible_model').every(c=>c.checks.some(x=>x.id==='FOUR_DIMENSIONAL' && x.status==='pass')));
    await button('Миссия').click();await objects();
    await importZone('От земли до FL140');
    const groundBefore=JSON.stringify(coord(await read()));
    if(await page.locator('.base-map-feedback button[aria-label]').count())await page.locator('.base-map-feedback button[aria-label]').last().click();
    await drag(marker());
    check('Ground zone still blocks base placement',JSON.stringify(coord(await read()))===groundBefore);
    const blockedResponse=page.waitForResponse(r=>r.url().includes('/missions/solve') && r.request().method()==='POST',{timeout:60000});
    await button('Рассчитать варианты').click();
    const blocked=await(await blockedResponse).json();
    check('Ground zone does not produce fake success',blocked.candidates?.every(c=>c.status!=='feasible_model'),blocked.candidates?.map(c=>c.status));
    await button('Миссия').click();await objects();
    await importZone('От земли до FL140','<TimeSpan><begin>2020-01-01T00:00:00Z</begin><end>2020-01-02T00:00:00Z</end></TimeSpan>');
    if(await page.locator('.base-map-feedback button[aria-label]').count())await page.locator('.base-map-feedback button[aria-label]').last().click();
    await drag(marker());
    check('Explicit expired interval allows ground placement in a later mission',JSON.stringify(coord(await read()))!==groundBefore);
    await objects();await ensureOpen('.airspace-layer-details');
    await page.screenshot({path:'output/playwright/airspace-20260924.png'});
    await page.setViewportSize({width:900,height:900});
    check('Compact zone settings do not overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    check('No runtime errors',errors.length===0,errors);
  } finally {
    page.off('pageerror',err);
    await page.evaluate(report=>{window.__airspaceReport=report;},{passed:checks.filter(c=>c.pass).length,checks,errors});
  }
  return {passed:checks.length,checks,errors};
}
