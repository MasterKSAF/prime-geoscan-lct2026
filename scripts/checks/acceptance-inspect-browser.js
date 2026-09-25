async (page) => {
  const pages=page.context().pages();
  return await Promise.all(pages.map(async p=>({url:p.url(),body:await p.locator('body').innerText({timeout:3000}).then(t=>t.slice(-16000)).catch(e=>String(e))})));
}
