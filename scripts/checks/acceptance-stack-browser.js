async(page)=>{
 const p=page.context().pages().at(-1), cdp=await p.context().newCDPSession(p);
 const paused=new Promise(resolve=>cdp.once('Debugger.paused',resolve));
 try {
   await cdp.send('Debugger.enable');await cdp.send('Debugger.pause');
   const event=await paused;
   const fragments=[];
   for(const f of event.callFrames.slice(0,3)){const src=await cdp.send('Debugger.getScriptSource',{scriptId:f.location.scriptId});const line=src.scriptSource.split('\n')[f.location.lineNumber];fragments.push({name:f.functionName,line:f.location.lineNumber,column:f.location.columnNumber,fragment:line.slice(Math.max(0,f.location.columnNumber-650),f.location.columnNumber+650)});}
   return {url:p.url(),stack:event.callFrames.map(f=>({name:f.functionName,url:f.url,line:f.location.lineNumber,column:f.location.columnNumber})),fragments};
 } finally {await cdp.send('Debugger.resume').catch(()=>{});await cdp.detach();}
}
