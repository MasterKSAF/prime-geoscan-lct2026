import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const req=createRequire(path.resolve(process.env.RUNTIME_NODE_MODULES??'node_modules','../authoring-runtime.cjs'));
const {FileBlob,PresentationFile}=await import(pathToFileURL(req.resolve('@oai/artifact-tool')).href);
const root=process.cwd(), skill=process.env.PRESENTATIONS_SKILL_DIR;
if(!skill)throw Error('PRESENTATIONS_SKILL_DIR is required');
const out=path.resolve(root,process.env.DECK_OUTPUT_DIR??'docs/planner/submission/presentation');
const tmp=path.resolve(root,'tmp/deck-repair');
await fs.mkdir(tmp,{recursive:true});await fs.mkdir(out,{recursive:true});
const source=path.resolve(root,'docs/planner/submission/presentation/prime-geoscan-lct2026.pptx');
const reference=path.resolve(root,'docs/references/lct2026-presentation-template.pptx');
const p=await PresentationFile.importPptx(await FileBlob.load(source));
await fs.writeFile(path.join(tmp,'source-layout.ndjson'),(await p.inspect({kind:'slide,layout,textbox',maxChars:100000})).ndjson);
await fs.writeFile(path.join(tmp,'source-masters.json'),JSON.stringify({masters:p.masters.items.map(m=>({id:m.id})),layouts:p.layouts.items.map(l=>({id:l.id,placeholders:l.placeholders.summary()}))},null,2));
const original=[...p.slides.items],cover=original[0],content=original[1],slides=[],notes=[];
const b=JSON.parse(await fs.readFile('docs/planner/submission/evidence/benchmark/report.json','utf8'));
const release=JSON.parse(await fs.readFile('docs/planner/submission-manifest.json','utf8'));
const counts=release.verification_snapshot;
const pct=x=>x.toFixed(2).replace('.',',')+'%';
const a=b.aggregate.objectives;
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const purple='#510E75',ink='#24212C',muted='#5C5666',font='Montserrat';
function text(s,value,x,y,w,h,size=28,color=ink,bold=false){
 const sh=s.shapes.add({geometry:'textbox',name:'text-'+s.shapes.items.length,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=value;sh.text.style={typeface:font,fontSize:size,bold,color,autoFit:'none',wrap:'square',verticalAlignment:'top',insets:{top:0,left:0,right:0,bottom:0}};
 return sh;
}
function slide(title,speech,refs=[],isCover=false){
 const s=(isCover?cover:content).duplicate();
 // Remove actual source objects, not just their text: no unused placeholder frames.
 for(const sh of [...s.shapes.items])sh.delete();
 for(const im of [...s.images.items])im.delete();
 if(!isCover){
  s.shapes.add({geometry:'rect',name:'White body background',position:{left:0,top:132,width:1280,height:588},fill:'#FFFFFF',line:{fill:'none',width:0}});
  text(s,title,56,43,664,73,36,'#FFFFFF',true);
  text(s,String(slides.length+1).padStart(2,'0'),1198,680,45,29,17,muted);
 }
 slides.push(s);notes.push({title,speech,refs});
 s.speakerNotes.textFrame.setText(speech+'\n\nИсточники:\n'+refs.join('\n'));
 return s;
}
function rows(s,items,{top=183,gap=112,labelWidth=285}={}){
 items.forEach(([label,body],i)=>{
  text(s,label,66,top+i*gap,labelWidth,80,29,purple,true);
  text(s,body,375,top+i*gap,831,85,27);
 });
}
function imageNotes(s,items){
 items.forEach(([label,body],i)=>{
  text(s,label,64,185+i*137,326,74,29,purple,true);
  text(s,body,64,252+i*137,326,66,24);
 });
}
async function shot(s,file){s.images.add({blob:new Uint8Array(await fs.readFile(file)),contentType:'image/png',alt:path.basename(file),fit:'contain',position:{left:430,top:164,width:798,height:510}});}
function table(s,values,widths,top=198,height=350){
 const t=s.tables.add({rows:values.length,columns:values[0].length,left:66,top,width:1148,height,columnWidths:widths,values});
 t.styleOptions={headerRow:false,bandedRows:false,bandedColumns:false,firstColumn:false,lastColumn:false,totalRow:false};
 const noLine={width:0,color:'#FFFFFF'};
 t.borders.assign({outside:noLine,inside:noLine,insideHorizontal:noLine,insideVertical:noLine});
 t.cells.block({row:0,column:0,rowCount:values.length,columnCount:values[0].length}).assign({fill:'#FFFFFF',borders:{top:noLine,bottom:noLine,left:noLine,right:noLine},margins:{top:12,bottom:12,left:0,right:20},anchor:'center'});
 for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){
  t.getCell(r,c).text.style={typeface:font,fontSize:r===0?26:27,color:r===0?purple:ink,bold:r===0,wrap:'square',autoFit:'none'};
 }
 return t;
}
let s=slide('Планер / PRIME','Калеев Сергей и Миняев Револь представляют сервис планирования группы БВС для задачи №5 Геоскана. Оператор задаёт работы и ограничения. Система предлагает план, показывает его выполнение в симуляции и сохраняет проверяемый отчёт.',['docs/geoscan-md/geoscan-track5-tz.md'],true);
text(s,'ПЛАНЕР / PRIME',64,188,742,100,58,'#FFFFFF',true);
text(s,'Планирование и распределение\nбеспилотных авиационных работ',68,322,735,114,33,'#FFFFFF');
text(s,'Задача №5 Геоскана\nЛЦТ 2026',68,466,640,84,26,'#FFFFFF');
text(s,'Калеев Сергей\nМиняев Револь',68,594,660,76,26,'#FFFFFF');

s=slide('Какую задачу решаем','В одной миссии могут быть разные виды работ и участки. Нужны совместимые аппараты, достаточный заряд и расписание без конфликтов. Оператор выбирает, что важнее: закончить раньше или уменьшить суммарное время полётов.',['docs/geoscan-md/geoscan-track5-tz.md','docs/planner/submission/SOLUTION-PASSPORT.md']);
rows(s,[['Входные данные','Участки, работы и сроки.\nПарк БВС, базы, погода и запреты.'],['Расчёт','Какие аппараты назначить, куда лететь\nи в какое время выполнять работы.'],['Приоритет','Раньше закончить всю миссию\nили сократить суммарное время полётов.'],['Результат','План на карте, ход симуляции\nи отчёт с результатами проверок.']],{top:176,gap:114});

s=slide('Как устроен сервис','Сервис запускается локально в Docker. React и Leaflet дают интерфейс и карту. TypeScript-ядро строит кандидатов на CPU. Повторный валидатор проверяет ограничения. IndexedDB сохраняет миссии и историю. Для тайлов и свежего прогноза нужна сеть.',['package-lock.json','docs/planner/submission/SOLUTION-PASSPORT.md']);
table(s,[['Часть системы','Назначение'],['Веб-интерфейс','Редактор, карта, выполнение и парк БВС'],['Расчёт на CPU','Маршруты, выбор аппаратов и расписание'],['Повторная проверка','Энергия, препятствия и разнесение'],['Хранение и экспорт','История миссий, JSON, KML и GeoJSON']],[365,783],179,375);
text(s,'React + Leaflet     TypeScript     IndexedDB     Docker',66,590,1120,44,25,purple,true);
text(s,'GPU не требуется. Карта и свежий прогноз используют внешние сервисы.',66,637,1120,42,22,muted);

s=slide('Как выбирается план','Ядро строит полосы покрытия и безопасные переходы, проверяет совместимость сенсоров и ресурс, затем формирует расписание. Ограниченный поиск сравнивает кандидатов по двум критериям. Мы не заявляем доказанный глобальный оптимум.',['lib/planner/mission-engine.ts','lib/planner/mission-validation.ts']);
rows(s,[['01  Маршруты','Полосы съёмки, переходы и обход запретов.'],['02  Аппараты','Подходящий сенсор, текущий заряд\nи возможность повторного вылета.'],['03  Расписание','Окна работ, занятость баз\nи безопасное разнесение аппаратов.'],['04  Выбор','Проверка кандидатов и сравнение\nвремени завершения с общим налётом.']],{top:182,gap:113});

s=slide('Редактор миссии','Одна миссия может включать несколько видов работ и территорий. Для каждой работы задаются свои качество, период и аппараты. Автовыбор учитывает совместимость сенсоров. Общие запреты распространяются на миссию.',['docs/planner/submission/INTERFACE-GUIDE.md']);
imageNotes(s,[['Работы и участки','Своя территория\nдля каждой работы.'],['Качество и срок','Высота съёмки\nи период выполнения.'],['Выбор БВС','Автоматически\nили вручную.']]);await shot(s,'docs/planner/submission/assets/editor.png');

s=slide('Парк и батарея','В каталоге доступны Gemini, 801 и 201. Модель 201 использует отдельный самолётный профиль. Текущий заряд сохраняется между вылетами. Новый полный заряд появляется только при обновлении состояния. Реальную бортовую телеметрию мы ещё не подключали.',['lib/planner/mission-vehicle-catalog.ts','docs/planner/submission/SOLUTION-PASSPORT.md']);
imageNotes(s,[['Gemini, 801, 201','Выбор модели\nи оборудования.'],['Текущий заряд','Повторный вылет,\nесли хватает ресурса.'],['База и состояние','Источник данных\nвиден оператору.']]);await shot(s,'docs/planner/submission/assets/fleet.png');
text(s,'Связь с реальным БВС пока не подключена.',66,640,344,54,21,muted);

s=slide('Три сценария защиты','Показываем три переносимых JSON-примера. Первый проходит полный цикл. Второй использует весь KML экспертов и показывает обход записи вышки в Приморье. Работа, базы и ветер модельные. Третий не имеет достаточного заряда: система объясняет отказ и проверяет предлагаемое изменение.',['public/planner/scenarios/demo-01-survey.mission.json','public/planner/scenarios/demo-02-expert-obstacles.mission.json','public/planner/scenarios/demo-03-repair.mission.json']);
table(s,[['Сценарий','Что демонстрируем'],['1. Съёмка квадрата','От загрузки миссии до готового отчёта'],['2. KML экспертов','Обход препятствия, разнесение и ZIP'],['3. Не хватает заряда','Причина отказа и проверка исправления']],[400,748],183,360);
text(s,'Каждый пример можно загрузить, изменить и пересчитать.',66,579,1140,48,28,purple,true);
text(s,'Демо 2: исходный слой экспертов. Миссия и условия остаются модельными.',66,642,1140,44,23,muted);

s=slide('Препятствия из KML','Импортировали исходный KML экспертов: 3 201 объект, включая 56 линий. Сохранили исходные байты и все высоты. Замкнули 15 колец в производной геометрии с протоколом. Без DEM нельзя смешивать абсолютные отметки с высотой над землёй, поэтому используем горизонтальный обход на всех высотах. После локального поиска проверяем сегменты маршрута по полному источнику. В Демо 2 протокол ухода подтвердил 56 из 56 интервалов при исходных условиях. Это расчётная проверка, не аппаратная сертификация.',['docs/planner/submission/evidence/obstacles/verification.json','lib/planner/obstacle-layer.ts','lib/planner/mission-contingency.ts']);
imageNotes(s,[['3 201 объект','Полигоны и линии\nиз файла экспертов.'],['Обход сбоку','Без подмены\nсистемы высот.'],['Полная проверка','Маршруты сверяются\nсо всем источником.']]);await shot(s,'docs/planner/submission/assets/calculated.png');
text(s,'Без DEM перелёт сверху не заявлен.',66,640,344,54,21,muted);

s=slide('Результат сравнения','Проверили 21 задачу с тремя повторами. Для процентов использовали 10 задач, в которых обе сравниваемые стратегии нашли полный допустимый план. Последовательная базовая стратегия выполняет вылеты по очереди. Параллельная допускает простой параллельный запуск. Это наши воспроизводимые базовые алгоритмы, а не продукты конкурентов. Наш поиск дал полные планы для 11 из 21 задач, базовые для 10. Все отрицательные исходы сохранены.',['docs/planner/submission/evidence/benchmark/report.json','docs/planner/submission/evidence/benchmark/verification.json']);
text(s,'Медианное сокращение по 10 сопоставимым задачам',66,174,1140,52,29,purple,true);
table(s,[['Что сокращаем','Против плана\nпо очереди','Против простого\nпараллельного плана'],['Время завершения',pct(a.makespan.improvementPercent.p50),pct(a.makespan.parallelBaseline.improvementPercent.p50)],['Общее время полётов',pct(a.flightTime.improvementPercent.p50),pct(a.flightTime.parallelBaseline.improvementPercent.p50)]],[464,322,362],255,243);
text(s,'Весь набор: 21 задача, по 3 повтора.',66,537,1140,48,28,purple,true);
text(s,'Полный план: 11 из 21 у нашего поиска, 10 из 21 у базовых алгоритмов.',66,591,1140,58,25);
text(s,'Неполные результаты сохранены. Глобальный оптимум не доказан.',66,652,1110,43,22,muted);

s=slide('Что получает эксперт',`В комплекте код, Docker, переносимые входы и доказательства. ZIP BagIt 1.0 содержит оригинальный KML, вход, план, маршруты, журнал и SHA-256. Проверили скачанный из браузера архив отдельным модельным проходом и Python stdlib. Прошли ${counts.unit.pass} модульных, ${counts.acceptance.pass} приёмочных и ${counts.browser.pass} текущих браузерных проверок. Базовый API: 11 проверок. Расширенный API: 6 на повторе, первый прогон воспроизвёл известный 503 после большого отклонённого запроса. Ограничение записано в документации.`,['docs/planner/submission/VERIFICATION.md','docs/planner/submission/evidence/browser/mission.evidence.zip']);
text(s,String(counts.unit.pass),66,180,350,76,54,purple,true);text(s,'модульных тестов',66,257,345,50,27);
text(s,`${counts.acceptance.pass} приёмочных\n${counts.browser.pass} браузерных`,66,338,345,138,27);
text(s,'ZIP с оригиналом KML\nЖурнал и SHA-256\nПовторная проверка',66,528,345,122,25);await shot(s,'docs/planner/submission/assets/report.png');

s=slide('Границы решения','Готов локальный инженерный стенд. Для реальных полётов нужны телеметрия, цифровая модель рельефа, калибровка расхода энергии и качества съёмки, испытания. Для эксплуатации добавляются серверная очередь, права доступа и адаптер автопилота. Число пройденных тестов не является гарантией безопасности полёта.',['docs/planner/submission/KNOWN-LIMITATIONS.md']);
rows(s,[['Работает сейчас','Планирование, симуляция,\nэкспорт и повторная проверка результата.'],['Для реальных полётов','Телеметрия, рельеф, калибровка\nбатареи и съёмки, испытания.'],['Для эксплуатации','Серверная очередь, права доступа\nи подключение автопилота.']],{top:190,gap:134});
text(s,'Паспортные характеристики и прогноз не заменяют реальные измерения.',66,635,1140,55,25,muted);

s=slide('Команда и материалы','Калеев Сергей и Миняев Револь. Исходный код и комплект эксперта находятся в закрытом репозитории. Доступ экспертам выдаст владелец после получения логинов. Начать проверку можно с README.',['README.md','docs/planner/submission/README.md']);
text(s,'Калеев Сергей\nМиняев Револь',66,183,1120,126,39,purple,true);
text(s,'Исходный код и Docker-стенд',66,364,1140,57,33);
text(s,'Паспорт решения, инструкция и доказательства',66,433,1140,69,30);
text(s,'github.com/MasterKSAF/prime-geoscan-lct2026',66,552,1140,61,30,purple);
text(s,'Начало проверки: README.md. Доступ экспертам предоставит владелец.',66,638,1120,55,24,muted);

for(const old of original)old.delete();slides.forEach((s,i)=>s.moveTo(i));
const candidate=path.join(tmp,'candidate-corrected.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
const finalPath=path.join(out,process.env.DECK_FILENAME??'prime-geoscan-lct2026-corrected.pptx');
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,pythonExecutable:process.env.PRESENTATIONS_PYTHON,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),explicitTotalSlideCount:12,requiredNativeTableOwnerSlides:[3,7,9],requiredNativeChartOwnerSlides:[],layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...[3,7,9].flatMap(n=>['--require-native-table-slide',String(n)])],fontPolicy:{basis:'reference',families:['Montserrat'],referencePath:reference,referenceSha256:createHash('sha256').update(await fs.readFile(reference)).digest('hex')},verifyArtifactToolImport:true,receiptPath:path.join(tmp,(process.env.DECK_FILENAME??'corrected')+'.validation.json')});
console.log('Finalized',JSON.stringify({finalPath,sha256:result.finalSha256,layout:result.presentationLayout}));
await fs.writeFile(path.join(tmp,'notes-v2.json'),JSON.stringify(notes,null,2));
const tick=String.fromCharCode(96);
await fs.writeFile(path.join(out,'SPEAKER-NOTES.md'),'# Текст выступления\n\nПланер / PRIME. Калеев Сергей, Миняев Револь.\n\n'+notes.map((n,i)=>'## '+(i+1)+'. '+n.title+'\n\n'+n.speech+'\n\nИсточники: '+n.refs.map(r=>tick+r+tick).join(', ')+'.\n').join('\n'));
console.log('Native PowerPoint rendering and inspection are required before delivery.');
