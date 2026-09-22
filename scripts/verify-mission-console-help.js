async (page) => {
  const checks=[],errors=[];
  const check=(name,pass)=>{checks.push({name,pass:!!pass});if(!pass)throw Error(name);};
  page.on('dialog',d=>void d.accept());page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.setViewportSize({width:1440,height:960});await page.goto('http://127.0.0.1:3016/planner');
    await page.getByRole('tab',{name:'Редактор',exact:true}).click();
    await page.locator('.mission-map[data-map-ready=true]').waitFor();
    const host=await page.locator('.mission-map-canvas').elementHandle();
    await page.locator('.mw-map-display > summary').click();
    check('map display options available',await page.getByRole('button',{name:'Подложка',exact:true}).isVisible());
    await page.getByRole('button',{name:'Подложка',exact:true}).click();
    check('tiles can hide while geometry stays',await page.locator('.mission-map').isVisible());
    await page.getByRole('button',{name:'Подложка',exact:true}).click();
    await page.getByRole('button',{name:'Ветер',exact:true}).click();
    check('wind display opens from map menu',await page.locator('.mw-wind-overlay').isVisible());
    await page.getByRole('button',{name:'Ветер',exact:true}).click();
    await page.locator('.mw-map-display > summary').click();
    check('map menu never replaces Leaflet host',await host.evaluate(el=>el===document.querySelector('.mission-map-canvas')));
    await page.getByRole('button',{name:'Настройки и справка'}).click();
    await page.getByRole('button',{name:'Справка по программе',exact:true}).click();
    await page.getByRole('tab',{name:'Экраны',exact:true}).click();
    const pictures=page.getByRole('dialog').locator('img');
    check('help contains three real screenshots',await pictures.count()===3);
    for(let i=0;i<3;i++){await pictures.nth(i).scrollIntoViewIfNeeded();await pictures.nth(i).evaluate(img=>img.decode());check(`help screenshot ${i+1} loads`,await pictures.nth(i).evaluate(img=>img.naturalWidth>0&&img.naturalHeight>0));}
    await page.getByRole('dialog').locator('.mw-modal-body').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:'output/playwright/redesign-2026-09-20/help.png'});
    await page.setViewportSize({width:390,height:844});
    check('help has no mobile horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.getByRole('dialog').getByRole('button',{name:'Закрыть окно'}).click();
    await page.setViewportSize({width:1440,height:960});
    check('closing help returns to same map',await host.evaluate(el=>el===document.querySelector('.mission-map-canvas')));
    check('help no browser exceptions',errors.length===0);
  }catch(e){checks.push({name:String(e),pass:false});}
  const report={createdAt:new Date().toISOString(),checks,errors};page.__consoleHelpReport=report;return report;
}
