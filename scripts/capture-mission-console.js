async (page) => {
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('tab',{name:'Миссии',exact:true}).click();
  await page.getByRole('button',{name:'Открыть выполнение',exact:true}).first().click();
  await page.getByRole('combobox',{name:'Скорость симуляции'}).selectOption('40');
  await page.locator('.mw-playback').getByRole('button',{name:'Продолжить симуляцию',exact:true}).click();
  await page.locator('.mw-drone-button.moving').first().waitFor();
  await page.locator('.mw-alert.success').waitFor({state:'hidden',timeout:15000});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/redesign-2026-09-20/execution-final.png'});
  await page.locator('.mw-playback').getByRole('button',{name:'Пауза',exact:true}).click();
  await page.locator('.mw-playback').getByRole('button',{name:'Продолжить симуляцию',exact:true}).waitFor();
  return {screenshot:'output/playwright/redesign-2026-09-20/execution-final.png',paused:true};
}
