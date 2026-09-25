import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const out = 'output/playwright/acceptance-2026-09-25/ui';
await mkdir(out, { recursive: true });
const cli = process.env.PLAYWRIGHT_CLI_ENTRY;
if (!cli) throw Error('Set PLAYWRIGHT_CLI_ENTRY');
const session = 'acceptance-20260925-camera';
for (const name of process.argv.slice(2)) {
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('Invalid callback name');
  const source = await readFile(`scripts/checks/${name}.js`, 'utf8');
  const generated = path.join(out, `${name}.generated.js`);
  await writeFile(generated, `async (oldPage) => {
    const page = await oldPage.context().newPage();
    await page.goto('http://127.0.0.1:3016/planner?acceptance=20260925');
    await page.getByRole('region',{name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).first().waitFor();
    // Only this dedicated acceptance profile is reset; never the user profile.
    await page.getByRole('button',{name:'Настройки и справка',exact:true}).click();
    await page.evaluate(()=>{window.__testConfirm=window.confirm;window.confirm=()=>true;});
    await page.getByRole('button',{name:'Начать с нуля',exact:true}).click();
    await page.evaluate(()=>{window.confirm=window.__testConfirm;delete window.__testConfirm;});
    await page.getByRole('region',{name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).first().waitFor();
    try { return {name:${JSON.stringify(name)},...await (${source.trim()})(page)}; }
    catch(error) {
      await page.screenshot({path:${JSON.stringify(`${out}/${name}-failure.png`)}}).catch(()=>{});
      return {name:${JSON.stringify(name)},failure:String(error),partial:await page.evaluate(()=>window.__acceptance20260925).catch(()=>null),body:await page.locator('body').innerText({timeout:15000}).catch(()=>'(body timeout)')};
    } finally { await page.close(); }
  }`);
  const startedAt = new Date().toISOString();
  const run = await new Promise(resolve => {
    const child = spawn(process.execPath,[cli,`-s=${session}`,'run-code',`--filename=${generated}`],{windowsHide:true});
    let output='';
    child.stdout.on('data',data=>output+=data);
    child.stderr.on('data',data=>output+=data);
    child.on('error',error=>resolve({code:-1,output:String(error)}));
    child.on('exit',code=>resolve({code,output}));
  });
  await writeFile(path.join(out,`${name}.log`),run.output);
  let result;
  try { result=JSON.parse(run.output.match(/### Result\r?\n([\s\S]*?)(?:\r?\n### |$)/)?.[1]); } catch {}
  const passed=run.code===0&&!!result&&!result.failure&&result.checks?.length>0&&result.checks.every(c=>c.pass);
  const report={name,startedAt,finishedAt:new Date().toISOString(),exitCode:run.code,passed,result};
  await writeFile(path.join(out,`${name}.result.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({name,passed,checks:result?.checks?.length,failure:result?.failure??(!result?run.output.slice(-1800):undefined)}));
  if(!passed)process.exitCode=1;
}
