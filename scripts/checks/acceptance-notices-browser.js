async(page)=>{
 const p=page.context().pages().at(-1);
 const region=p.getByRole('region',{name:'Центр уведомлений'});
 if(!await region.count())await p.getByRole('button',{name:/^Уведомления/}).click();
 return await p.locator('body').innerText();
}
