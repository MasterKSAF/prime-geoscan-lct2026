async(page)=>{
 const p=page.context().pages().at(-1),cdp=await p.context().newCDPSession(p);
 try {
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await page.waitForTimeout(2000); // Measured profiling interval, not an interaction wait.
  const {profile}=await cdp.send('Profiler.stop');
  const counts=new Map();for(const id of profile.samples??[])counts.set(id,(counts.get(id)||0)+1);
  const top=profile.nodes.map(n=>({...n,count:counts.get(n.id)||0})).sort((a,b)=>b.count-a.count).slice(0,8);
  await cdp.send('Debugger.enable');
  const result=[];
  for(const n of top){const f=n.callFrame;let fragment='';try{const {scriptSource}=await cdp.send('Debugger.getScriptSource',{scriptId:f.scriptId});const line=scriptSource.split('\n')[f.lineNumber];fragment=line?.slice(Math.max(0,f.columnNumber-100),f.columnNumber+500);}catch{}result.push({count:n.count,...f,fragment});}
  return {url:p.url(),samples:profile.samples?.length,top:result};
 } finally {await cdp.detach();}
}
