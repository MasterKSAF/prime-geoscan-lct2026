// Final deployed UI smoke check; no fixture writes or user storage clearing.
async (page) => {
  page.on('dialog',dialog=>void dialog.accept());
  const out='output/playwright/journal-notifications',checks=[];
  const check=(name,pass,detail='')=>{checks.push({name,pass:!!pass,detail});if(!pass)throw Error(`${name}: ${detail}`);};
  await page.setViewportSize({width:1440,height:960});
  await page.reload();
  const icon=page.getByRole('button',{name:/^Уведомления/});
  await icon.waitFor();
  const desktop=await icon.boundingBox();
  check('desktop triangle is in top-right toolbar',desktop.x>1300&&desktop.y<30,JSON.stringify(desktop));
  check('triangle has legible color on dark toolbar',await icon.evaluate(e=>['rgb(220, 231, 250)','rgb(239, 195, 109)'].includes(getComputedStyle(e).color)));
  await page.screenshot({path:`${out}/04-final-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const mobile=await icon.boundingBox();
  check('mobile triangle stays on the right',mobile.x>260&&mobile.x+mobile.width<=390,JSON.stringify(mobile));
  check('mobile header has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await icon.click();
  check('final history opens from triangle',await page.getByRole('region',{name:'Центр уведомлений',exact:true}).isVisible());
  await page.screenshot({path:`${out}/05-final-mobile.png`,fullPage:true});
  await page.getByRole('button',{name:'Закрыть центр уведомлений',exact:true}).click();
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Настройки и справка',exact:true}).click();
  await page.getByRole('button',{name:'Состояние парка',exact:true}).click();
  const fleet=page.getByRole('dialog',{name:'Парк БВС',exact:true});
  for(const model of ['Gemini','801','201'])check(`final deployment exposes ${model}`,await fleet.getByRole('button',{name:`Добавить Геоскан ${model}`,exact:true}).isVisible());
  await page.screenshot({path:`${out}/06-final-catalog.png`,fullPage:true});
  await fleet.getByRole('button',{name:'Закрыть окно',exact:true}).click();
  const report={at:new Date().toISOString(),checks};
  const pending=page.waitForEvent('download');
  await page.evaluate(report=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.href=url;a.download='final-layout-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await(await pending).saveAs(`${out}/final-layout-report.json`);
  return report;
}
