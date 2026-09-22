async (page) => {
  await page.goto('http://127.0.0.1:3016/planner');
  await page.locator('.mission-map[data-map-ready=true]').waitFor();
  await page.getByRole('combobox',{name:'Тема интерфейса'}).selectOption('dark');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[role=tab][aria-selected=true]')).color==='rgb(158, 220, 255)');
  const active=page.getByRole('tab',{name:'Планирование',exact:true});
  const color=await active.evaluate(el=>getComputedStyle(el).color);
  if(color!=='rgb(158, 220, 255)')throw new Error('Dark active tab contrast color regression: '+color);
  await page.screenshot({path:'output/playwright/tabs-weather-2026-09-19/final-dark-navigation.png'});
  await page.getByRole('combobox',{name:'Тема интерфейса'}).selectOption('light');
  await page.locator('html[data-prime-theme=light]').waitFor();
  await page.screenshot({path:'output/playwright/tabs-weather-2026-09-19/final-light-planning.png'});
  return {darkActiveTabColor:color,mapVisible:await page.locator('.mission-map-canvas').isVisible()};
}
