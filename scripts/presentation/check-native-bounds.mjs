import fs from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Usage: node check-native-bounds.mjs native-layout.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const failures = [];
let boxes = 0;
for (const slide of data.slides) {
  for (const owner of slide.shapes) {
    for (const box of [owner, ...(owner.cells ?? [])]) {
      if (!box.text || !Number.isFinite(box.boundWidth)) continue;
      boxes++;
      // Table cell ranges use a local coordinate system in PowerPoint COM.
      // Their measured text extent is reliable; absolute placement is reviewed visually.
      const excess = box.row ? {right:box.boundWidth-box.width, bottom:box.boundHeight-box.height} : {
        left: box.left - box.boundLeft,
        top: box.top - box.boundTop,
        right: box.boundLeft + box.boundWidth - box.left - box.width,
        bottom: box.boundTop + box.boundHeight - box.top - box.height,
      };
      // PowerPoint font metrics may extend a fraction of a point beyond the box.
      if (Object.values(excess).some(n => n > 2)) failures.push({slide:slide.slide, name:owner.name, text:box.text, excess});
    }
  }
}
console.log(JSON.stringify({file, slides:data.slides.length, textBoxesAndCells:boxes, failures}, null, 2));
if (failures.length) process.exitCode = 1;
