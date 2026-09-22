import fs from 'node:fs/promises';
const file=process.argv[2];if(!file)throw Error('Pass PowerPoint native-layout.json');
const d=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const issues=[];let textBoxes=0,cells=0;
const fit=(s,t,kind)=>{
 const e=1.5;
 if(t.boundTop<t.top-e||t.boundLeft<t.left-e||t.boundTop+t.boundHeight>t.top+t.height+e||t.boundLeft+t.boundWidth>t.left+t.width+e)issues.push({slide:s,kind:'text_outside_'+kind,text:t.text});
 if(t.boundTop<0||t.boundLeft<0||t.boundTop+t.boundHeight>d.height+e||t.boundLeft+t.boundWidth>d.width+e)issues.push({slide:s,kind:'text_outside_slide',text:t.text});
};
for(const s of d.slides){
 const text=s.shapes.filter(x=>x.text);
 textBoxes+=text.length;
 for(const t of text)fit(s.slide,t,'box');
 for(const shape of s.shapes){
  if(shape.type===14)issues.push({slide:s.slide,kind:'unused_placeholder',name:shape.name});
  // PowerPoint returns table text bounds in a cell-local coordinate system,
  // unlike ordinary text boxes. Compare extents, not absolute positions.
  for(const cell of shape.cells??[]){
   cells++;
   if(!Number.isFinite(cell.boundWidth)||!Number.isFinite(cell.boundHeight)||cell.boundWidth<0||cell.boundHeight<0)issues.push({slide:s.slide,kind:'unavailable_cell_bounds',text:cell.text});
   else if(cell.boundWidth>cell.width+1.5||cell.boundHeight>cell.height+1.5)issues.push({slide:s.slide,kind:'text_larger_than_cell',text:cell.text});
  }
 }
 for(let i=0;i<text.length;i++)for(let j=i+1;j<text.length;j++){
  const a=text[i],b=text[j];
  const w=Math.min(a.boundLeft+a.boundWidth,b.boundLeft+b.boundWidth)-Math.max(a.boundLeft,b.boundLeft);
  const h=Math.min(a.boundTop+a.boundHeight,b.boundTop+b.boundHeight)-Math.max(a.boundTop,b.boundTop);
  if(w>1.5&&h>1.5)issues.push({slide:s.slide,kind:'text_intersection',texts:[a.text,b.text]});
 }
}
const r={status:issues.length?'fail':'pass',application:d.application,version:d.version,slides:d.slides.length,textBoxes,tableCells:cells,issues,claimBoundary:'Native PowerPoint: ordinary text-box bounds, text intersections and unused placeholders; table cells checked for text width/height versus cell size only, not absolute placement or padding. Visual inspection of all rendered slides is also required.'};
console.log(JSON.stringify(r,null,2));if(issues.length)process.exitCode=1;
