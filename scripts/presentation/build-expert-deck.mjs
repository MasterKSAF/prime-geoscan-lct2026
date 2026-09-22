import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const authoringRequire=createRequire(path.resolve(process.env.RUNTIME_NODE_MODULES??'node_modules','../authoring-runtime.cjs'));
const {FileBlob,PresentationFile}=await import(pathToFileURL(authoringRequire.resolve('@oai/artifact-tool')).href);
// Run from repository root. Use the bundled Artifact Tool runtime as described
// in presentation/BUILD.md; authoring dependencies are not application runtime.
const root=process.cwd(), skill=process.env.PRESENTATIONS_SKILL_DIR;
if(!skill)throw Error('PRESENTATIONS_SKILL_DIR is required');
const out=path.resolve(root,process.env.DECK_OUTPUT_DIR??'docs/planner/submission/presentation'), tmp=path.join(root,'tmp/expert-deck');
await fs.mkdir(tmp,{recursive:true});
const source=path.join(root,'docs/references/lct2026-presentation-template.pptx');
const p=await PresentationFile.importPptx(await FileBlob.load(source));
const original=[...p.slides.items], cover=original[6], content=original[12];
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const b=JSON.parse(await fs.readFile('docs/planner/submission/evidence/benchmark/report.json','utf8'));
const pct=x=>x.toFixed(2).replace('.',',')+'%';
const a=b.aggregate.objectives, slides=[], notes=[];
function text(s,value,x,y,w,h,size=28,color='#202026',bold=false,font='Montserrat'){
 const sh=s.shapes.add({geometry:'textbox',name:'content-'+s.shapes.items.length,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=value;sh.text.style={typeface:font,fontSize:size,bold,color,autoFit:'none',verticalAlignment:'top',insets:{top:0,left:0,right:0,bottom:0}};return sh;
}
function slide(title,speech,refs=[],isCover=false){
 const s=(isCover?cover:content).duplicate();
 for(const sh of s.shapes.items){if(/^\d+$/.test(String(sh.text).trim()))sh.text='';}
 slides.push(s);notes.push({title,speech,refs});
 if(!isCover)text(s,title,56,44,660,84,title.length>27?30:36,'#FFFFFF',true,'Montserrat');
 s.speakerNotes.textFrame.setText(speech+'\n\nИсточники и доказательства:\n'+refs.join('\n'));
 return s;
}
async function shot(s,file,x=510,y=232,w=688,h=422){s.images.add({blob:new Uint8Array(await fs.readFile(file)),contentType:'image/png',alt:path.basename(file),fit:'contain',position:{left:x,top:y,width:w,height:h}});}
function rows(s,items,x=75,y=240,w=1125,size=28,gap=92){items.forEach(([heading,body],i)=>{text(s,heading,x,y+i*gap,w,35,size,'#510E75',true);text(s,body,x,y+39+i*gap,w,60,size-3);});}
function table(s,values,widths,y=240,height=280){
 const t=s.tables.add({rows:values.length,columns:values[0].length,left:76,top:y,width:1128,height,columnWidths:widths,values});
 t.borders.assign({width:1,fill:'#DDD5E5'});
 for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){
  const ce=t.getCell(r,c);ce.fill=r===0?'#510E75':(r%2?'#FFFFFF':'#F4EEF7');ce.text.style={typeface:'Montserrat',fontSize:r===0?25:26,color:r===0?'#FFFFFF':'#202026',bold:r===0};
 }
 return t;
}
let s=slide('Планер / PRIME','Представляем решение задачи №5 Геоскана. Планер распределяет работы между группой БВС, сравнивает время завершения и суммарный налёт, затем сохраняет проверяемый результат. Показываем инженерную модель без подключения настоящих аппаратов.',['docs/geoscan-md/geoscan-track5-tz.md'],true);
text(s,'ПЛАНЕР / PRIME',70,185,715,95,64,'#FFFFFF',true,'Montserrat');
text(s,'Планирование и распределение\nбеспилотных авиационных работ',70,300,710,120,35,'#FFFFFF');
text(s,'Задача №5 · Геоскан',70,456,620,44,29,'#FFFFFF');
text(s,'Калеев Сергей\nМиняев Револь',70,566,580,85,27,'#FFFFFF');

s=slide('Задача оператора','Нужно согласовать работы, установленное оборудование, текущий заряд и ограничения. Выход системы содержит назначения, маршруты, расписание и причины выбора. Карта и симуляция объясняют расчёт, а экспорт позволяет повторить проверку.',['docs/geoscan-md/geoscan-track5-tz.md, §2–5']);
rows(s,[['Вход','Участки и работы, парк БВС, сроки, базы, ветер и ограничения.'],['Выбор','Раньше завершить всю миссию или уменьшить общий налёт.'],['Результат','Назначения, расписание, маршруты KML/GeoJSON и отчёт запуска.'],['Роль оператора','Проверить условия, выбрать вариант и подтвердить конкретный план.']],75,232,1120,28,100);

s=slide('Архитектура решения','Веб работает с локальным HTTP API. Ядро написано на TypeScript и использует CPU. Схема проверяет вход, решатель строит кандидатов, а постпроверка заново проверяет ограничения. Данные оператора хранятся в IndexedDB. GPU и внешняя ML-модель не нужны.',['docs/planner/submission/SOLUTION-PASSPORT.md, §2','package-lock.json']);
table(s,[['Слой','Роль'],['React, Leaflet','Редактор, карта, выполнение, парк'],['TypeScript, CPU','Маршруты, назначение, расписание'],['Повторный валидатор','Ресурс, столкновения, коридоры, экспорт'],['IndexedDB, JSON','Миссии, журнал и переносимые снимки']],[355,773],235,355);
text(s,'Локальный Docker-стенд. Внешняя сеть нужна для тайлов и свежего прогноза.',77,610,1100,58,25);

s=slide('Алгоритм планирования','Сначала формируем полосы покрытия, затем перебираем ограниченный набор пакетов, порядков и назначений. Расписание учитывает окна работ, готовность, энергию и ограничения. Две цели используют один вход и общий пул допустимых кандидатов. Баланс показываем только при отличающемся плане. Глобальную оптимальность не заявляем.',['lib/planner/mission-engine.ts','lib/planner/mission-validation.ts','lib/planner/mission-comparison.ts']);
rows(s,[['01  Геометрия','Полосы покрытия, переходы, обход запретов и фазы полёта.'],['02  Ресурсы','Совместимые сенсоры, текущий заряд, доступность и повторные вылеты.'],['03  Расписание','Периоды работ, посадки, занятость площадок и разнесение.'],['04  Выбор и проверка','Время завершения и суммарный налёт. Ограниченный поиск.']],75,232,1120,28,100);

s=slide('Редактор миссии','Работы могут иметь разные участки, качество, время и допустимые аппараты. Параметры участков можно наследовать или задавать отдельно. Препятствия общие для всей миссии. Четыре главные вкладки оставляют детали по запросу.',['docs/planner/submission/INTERFACE-GUIDE.md','evidence/browser/dispatcher.json']);
text(s,'Несколько работ\nв одной миссии',76,240,380,95,32,'#510E75',true);
text(s,'Свой участок и качество\n\nСобственный период\n\nАвтовыбор или назначение\n\nОбщие запреты',76,358,385,260,26);
await shot(s,'docs/planner/submission/assets/editor.png');

s=slide('Общий парк БВС','Каталог включает Gemini, 801 и самолёт 201 с отдельной динамической моделью. Паспортные максимумы не заменяют рабочие бюджеты. Состояние батареи переносится между вылетами. Импорт показывает конфликты ID, а базы сохраняют постоянную идентичность. Настоящая телеметрия пока не подключена.',['lib/planner/mission-vehicle-catalog.ts','docs/planner/submission/SOLUTION-PASSPORT.md, §5, 8']);
text(s,'Gemini, 801, 201',76,241,400,55,32,'#510E75',true);
text(s,'Установленная нагрузка\n\nТекущая батарея\n\nБаза и доступность\n\nИсточник состояния',76,323,386,270,27);
text(s,'Профиль аппарата не подтверждает реальную связь с ним.',76,611,380,57,21);
await shot(s,'docs/planner/submission/assets/fleet.png');

s=slide('Три демонстрационных сценария','Первый пример показывает полный цикл фотосъёмки квадрата. Второй добавляет препятствие и конфликтующие траектории. Третий намеренно недостаточен по ресурсу: система объясняет отказ и проверяет гипотезу замены батареи. Все исходные JSON входят в поставку.',['docs/planner/submission/DEMO-SCRIPT.md','public/planner/scenarios/demo-01-survey.mission.json','public/planner/scenarios/demo-02-obstacles.mission.json','public/planner/scenarios/demo-03-repair.mission.json']);
table(s,[['Пример','Что проверяем'],['01  Фотосъёмка квадрата','Импорт, расчёт, выбор, выполнение, отчёт'],['02  Препятствия','Обход, расписание и разнесение БВС'],['03  Недостаточный заряд','Причина отказа и проверяемое исправление']],[410,718],255,290);
text(s,'Демонстрационные входы синтетические. Реальные кадры и бортовые логи не имитируются как полученные данные.',78,584,1100,82,27);

s=slide('Проверки безопасности','Разнесение проверяем непрерывно по модельным сегментам. Учитываем защитные объёмы и занятость площадок. Дополнительный анализ проверяет управляемый уход при исходных условиях. Параллельные миссии допускаем только в независимых районах, а действующий план пересматриваем на безопасной наземной точке.',['lib/planner/mission-validation.ts','lib/planner/mission-coordination.ts','lib/planner/mission-contingency.ts','tests/mission-eight-points.test.ts']);
text(s,'До подтверждения',76,240,400,45,32,'#510E75',true);
text(s,'Энергия и возврат\n\nСтолкновения и препятствия\n\nВоздушные коридоры\n\nЗанятость баз',76,320,400,270,27);
text(s,'Проверки относятся к объявленной модели полёта.',76,611,395,54,22);
await shot(s,'docs/planner/submission/assets/execution.png');

s=slide('Измеренное сравнение','Фиксированный набор содержит 21 задачу и три повтора. Полный план нашёлся для 11 задач, базовые методы решили 10. В таблице медианная экономия на 10 сопоставимых задачах, то есть 30 парах с повторами. Последовательный baseline даёт более крупный эффект, поэтому рядом показан и более сильный параллельный baseline. Неполные и отказные случаи сохранены.',['docs/planner/submission/evidence/benchmark/report.json','docs/planner/submission/evidence/benchmark/verification.json']);
table(s,[['Медианное сокращение','Последовательный','Параллельный'],['Время завершения',pct(a.makespan.improvementPercent.p50),pct(a.makespan.parallelBaseline.improvementPercent.p50)],['Суммарный налёт',pct(a.flightTime.improvementPercent.p50),pct(a.flightTime.parallelBaseline.improvementPercent.p50)]],[470,329,329],245,236);
text(s,'21 задача × 3 повтора. 10 сопоставимых задач для процентов.',78,512,1100,45,27,'#510E75',true);
text(s,'Полный результат: 11/21 у нашего поиска, 10/21 у baseline.\nОстальные исходы сохранены. Глобальный оптимум не доказан.',78,570,1100,88,26);

s=slide('Проверяемый результат','Тесты покрывают ядро, хранилища, импорт, безопасность и интерфейс. Отчёт запуска содержит вход, конкретный план, журнал достигнутого времени и состояние аппаратов. При пересмотре сохраняется цепочка версий. CLI повторно проверяет данные и отвергает подмену.',['docs/planner/submission/VERIFICATION.md','docs/planner/submission/evidence/browser/run.report.json']);
text(s,'483  модульных\n8  приёмочных\n50  браузерных\n11  HTTP-проверок',76,245,405,210,31,'#510E75',true);
text(s,'JSON/HTML запуска\n\nСвязь входа и плана\n\nСвой журнал и версии',76,474,397,164,25);
await shot(s,'docs/planner/submission/assets/report.png');

s=slide('Границы и развитие','Готов инженерный стенд с модельной симуляцией. Для реального применения нужны DEM и согласованные системы высот, телеметрия, калибровка энергии и съёмки, приёмка форматов автопилотом и полевые испытания. Эти ограничения указаны в документации и не считаются пройденными по количеству тестов.',['docs/planner/submission/KNOWN-LIMITATIONS.md','docs/planner/submission/SOLUTION-PASSPORT.md, §14']);
rows(s,[['Сейчас','Локальный планировщик, симуляция, экспорт и доказательства.'],['Для реального полёта','Телеметрия, DEM, калибровка энергии и качества, испытания.'],['Для эксплуатации','Серверная очередь, доступ пользователей и адаптер автопилота.'],['Ограничение выводов','Прогнозная погода и паспортные данные не подтверждают реальный полёт.']],75,232,1120,28,100);

s=slide('Комплект для эксперта','В репозитории находятся исходники, Docker, демонстрационные входы, презентация, паспорт, инструкция и доказательства. Стартовая точка — README. Репозиторий остаётся закрытым, доступ выдаёт владелец после получения логинов экспертов. Спасибо.',['README.md','docs/planner/submission/README.md']);
text(s,'Калеев Сергей\nМиняев Револь',76,240,1080,112,38,'#510E75',true,'Montserrat');
text(s,'Исходный код и Docker-демо\nПаспорт, инструкция, тесты и воспроизводимые входы',76,389,1110,100,30);
text(s,'github.com/MasterKSAF/prime-geoscan-lct2026',76,535,1110,50,30,'#510E75');
text(s,'Начало проверки: README.md\nРепозиторий закрыт. Доступ экспертам предоставит владелец.',76,601,1110,66,24);

for(const old of original)old.delete();
slides.forEach((s,i)=>s.moveTo(i));
await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(out,'slides'),{recursive:true});
const candidate=path.join(tmp,'candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
const finalPath=path.join(out,'prime-geoscan-lct2026.pptx');
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,
 pythonExecutable:process.env.PRESENTATIONS_PYTHON,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 explicitTotalSlideCount:12,requiredNativeTableOwnerSlides:[3,7,9],requiredNativeChartOwnerSlides:[],
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...[3,7,9].flatMap(n=>['--require-native-table-slide',String(n)])],
 fontPolicy:{basis:'reference',families:['Montserrat','Montserrat Medium','Poppins Light'],referencePath:source,referenceSha256:createHash('sha256').update(await fs.readFile(source)).digest('hex')},
 verifyArtifactToolImport:true,receiptPath:path.join(tmp,'validation.json')});
console.log('Finalization',JSON.stringify(result));

const final=await PresentationFile.importPptx(await FileBlob.load(finalPath));
for(let i=0;i<final.slides.items.length;i++){const im=await final.slides.items[i].export({format:'png',scale:1});await fs.writeFile(path.join(out,'slides',String(i+1).padStart(2,'0')+'.png'),new Uint8Array(await im.arrayBuffer()));}
await fs.writeFile(path.join(tmp,'notes.json'),JSON.stringify(notes,null,2));
await fs.writeFile(path.join(out,'SPEAKER-NOTES.md'),'# Текст выступления\n\nПланер / PRIME. Калеев Сергей, Миняев Револь.\n\n'+notes.map((n,i)=>`## ${i+1}. ${n.title}\n\n${n.speech}\n\nИсточники: ${n.refs.map(r=>'\x60'+r+'\x60').join(', ')}.\n`).join('\n'));
const imgs=await Promise.all(final.slides.items.map((_,i)=>fs.readFile(path.join(out,'slides',String(i+1).padStart(2,'0')+'.png'))));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Планер / PRIME — ЛЦТ 2026</title><style>*{box-sizing:border-box}body{margin:0;background:#180927;color:#fff;font:16px Arial}header{padding:14px 4vw;position:sticky;top:0;background:#180927ef;display:flex;gap:20px;align-items:center;z-index:2}main{max-width:1280px;margin:auto}section{margin:20px 0 45px}img{width:100%;height:auto;display:block}details{padding:15px 25px;line-height:1.5}button{background:#610c84;color:white;border:1px solid #b785d4;padding:7px 14px;cursor:pointer}a{color:#efc6ff}@media print{header,details{display:none}section{margin:0;break-after:page}body{background:white}}</style><header><strong>Планер / PRIME</strong><button onclick="document.documentElement.requestFullscreen?.()">Во весь экран</button><span>Клавиши ← →</span></header><main>${imgs.map((im,i)=>`<section id="s${i+1}"><img alt="${i+1}. ${escape(notes[i].title)}" src="data:image/png;base64,${im.toString('base64')}"><details><summary>Текст выступления и источники</summary><p>${escape(notes[i].speech)}</p><small>${notes[i].refs.map(escape).join('<br>')}</small></details></section>`).join('')}</main><script>let n=0;document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){n=Math.max(0,Math.min(11,n+(e.key==='ArrowRight'?1:-1)));document.getElementById('s'+(n+1)).scrollIntoView({behavior:'smooth'});}})</script></html>`;
await fs.writeFile(path.join(out,'index.html'),html);
console.log('Created 12-slide deck, PNG previews, standalone HTML, speaker notes');
