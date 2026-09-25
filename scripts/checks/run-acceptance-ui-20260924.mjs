import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Runs maintained UI regressions in a dedicated, disposable browser profile.
// Original callback files are untouched; generated copies and logs are evidence.
const root = process.cwd();
const out = 'output/playwright/acceptance-2026-09-24/ui';
await mkdir(out, { recursive: true });
const cli = process.env.PLAYWRIGHT_CLI_ENTRY;
if (!cli) throw Error('Set PLAYWRIGHT_CLI_ENTRY to @playwright/cli/playwright-cli.js');
const session = 'acceptance-20260924';
const tests = process.argv.slice(2);
if (!tests.length) tests.push('base-drag-20260924-browser', 'queue-layers-20260924-browser', 'airspace-20260924-browser', 'queue-plans-20260924-browser');
const results = [];
for (const name of tests) {
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('Invalid test name');
  let source = await readFile(`scripts/checks/${name === 'recovery37-blocked-browser' ? 'recovery37-browser' : name}.js`, 'utf8');
  if (name === 'recovery37-blocked-browser') source = source.replace("const blocked = page.url().includes('blocked');", 'const blocked = true;');
  source = source.replace(/output\/playwright\/(?!acceptance-2026-09-24\/)/g, `${out}/`);
  if (name === 'release38-browser') {
    source = source.replaceAll('Три сценария проверки', 'Миссии и загрузка');
    source = source.replace("result.engineVersion === '0.3.8'", "result.engineVersion === '0.3.9'");
    source = source.replaceAll('release038-prod', 'acceptance039');
    source = source.replace("await page.getByRole('region', { name: 'Миссии и загрузка' }).getByRole('button', { name: 'Редактировать', exact: true }).nth(i).click();", "await page.locator(`[data-scenario-id=\"${['demo-01-survey','demo-02-expert-obstacles','demo-03-repair'][i]}\"]`).getByRole('button', { name: /^Редактировать/ }).click();");
    source = source.replace('results.push({ demo: i + 1,', "check(`Demo ${i+1}: correct mission identity`,result.document.id === ['demo-01-survey','demo-02-expert-obstacles','demo-03-repair'][i]);\n      results.push({ demo: i + 1,");
    source = source.replace('status: c.status, metrics: c.metrics', "status: c.status, metrics: c.metrics, failures:c.checks?.filter(x=>x.status==='fail'), trace:c.trace?.filter(x=>/BUDGET|SEARCH|VEHICLE/.test(JSON.stringify(x))), warnings:result.warnings, computationMs:result.computationMs, budget:result.document?.planning?.maxComputeMs");
    source = source.replace("checks.push({ name: 'Unexpected', pass: false, detail: String(e) });", "checks.push({ name: 'Unexpected', pass: false, detail: String(e), body:await page.locator('body').innerText() });");
    source = source.replace("await save(row.getByRole('button', { name: /^Скачать проверки плана:/ })", "await row.locator('summary').filter({hasText:'Другие файлы'}).click();\n      await save(row.getByRole('button', { name: /^Скачать проверки плана:/ })");
    source = source.replace("check(`Demo ${i + 1}: correct feasibility`", "await page.screenshot({path:`output/playwright/acceptance-2026-09-24/ui/demo${i+1}-plans.png`});\n      check(`Demo ${i + 1}: correct feasibility`");
    source = source.replace("check('No browser JS errors'", "await page.screenshot({path:'output/playwright/acceptance-2026-09-24/ui/final-reports.png'});\n    check('No browser JS errors'");
  }
  if (['recovery37-browser','recovery37-blocked-browser'].includes(name)) {
    source = source.replace("if (!blocked) {", "if (!blocked) {\n      await page.locator('.me-works > summary').click();");
    source = source.replace("name: 'Отчёты миссий', exact: true", "name: /^Отчёты миссий/");
  }
  if (name === 'release-webm-browser') {
    source = source.replace("await page.getByRole('button',{name:'● Запись видео',exact:true}).waitFor();", "await page.getByRole('button',{name:'Пауза',exact:true}).waitFor();");
    source = source.replace("const dl=page.waitForEvent", "await first.locator('summary').filter({hasText:'Другие файлы'}).click();\n    const dl=page.waitForEvent");
    source = source.replace("await page.locator('summary').filter({hasText:/Что изменить, чтобы выполнить миссию/}).click();", "const repairs=page.locator('details.mi-repairs'); if(await repairs.getAttribute('open')===null)await repairs.locator(':scope > summary').click();");
  }
  if (['release38-browser', 'release-webm-browser'].includes(name)) {
    source = source.replaceAll("name: /^Скачать проверки плана:/", "name: 'Проверки JSON', exact:true");
    source = source.replaceAll("name: /^Скачать видео MP4:/", "name: 'Видео MP4', exact:true");
    source = source.replaceAll("name:/Скачать видео MP4:/", "name:'Видео MP4',exact:true");
  }
  // In this acceptance run both feasible official demos must finish, not only demo 2.
  if (name === 'queue-plans-20260924-browser') {
    source = source.replace('if (i === 1) {', 'if (i < 2) {');
    source = source.replace("check('Demo 2 completes its obstacle-aware plan through UI', true)", 'check(`Demo ${i+1} completes its plan through UI`, true)');
    // Shared-fleet state is deliberately not silently replenished between missions.
  }
  const callback = `async (oldPage) => {\nconst page = await oldPage.context().newPage();\nawait page.bringToFront();\nawait page.goto('http://127.0.0.1:3016/planner?acceptance=20260924');\nawait page.getByRole('region',{name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).first().waitFor();\ntry { const result = await (${source.trim()})(page); return { name:${JSON.stringify(name)}, ...result }; } catch(error) { await page.screenshot({path:${JSON.stringify(`${out}/${name}-failure.png`)}}); const partial = await page.evaluate(()=>window.__queuePlans ?? window.__airspaceReport ?? window.__queueReport); const notifications=page.getByRole('button',{name:/^Уведомления/}); if(await notifications.count() && !await page.locator('dialog[open]').count())await notifications.click().catch(()=>{}); return {name:${JSON.stringify(name)},failure:String(error),partial,body:await page.locator('body').innerText()}; } finally {await page.close();} }`;
  const setup = `await page.getByRole('button',{name:'Настройки и справка',exact:true}).click();\nawait page.evaluate(()=>{window.__acceptanceConfirm=window.confirm;window.confirm=()=>true;});\nawait page.getByRole('button',{name:'Начать с нуля',exact:true}).click();\nawait page.evaluate(()=>{window.confirm=window.__acceptanceConfirm;delete window.__acceptanceConfirm;});\nawait page.getByRole('region',{name:'Миссии и загрузка'}).getByRole('button',{name:'Редактировать',exact:true}).first().waitFor();\n`;
  const generated = path.join(out, `${name}.generated.js`);
  // Only between independent suites. Within a multi-mission suite the real
  // shared-fleet energy/availability state remains in force throughout.
  await writeFile(generated, callback.replace('try { const result = await (', setup+'try { const result = await ('));
  const startedAt = new Date().toISOString();
  const run = await new Promise(resolve => {
    const child = spawn(process.execPath, [cli, `-s=${session}`, 'run-code', `--filename=${generated}`], { cwd:root, windowsHide:true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => resolve({code:-1,output:String(error)}));
    child.on('exit', code => resolve({code,output}));
  });
  await writeFile(path.join(out, `${name}.log`), run.output);
  let result;
  const match = run.output.match(/### Result\r?\n([\s\S]*?)(?:\r?\n### |$)/);
  if (match) { try { result = JSON.parse(match[1]); } catch {} }
  const passed = run.code === 0 && !!result && !result.failure && result.checks?.length > 0 && result.checks.every(check => check.pass);
  results.push({name,startedAt,finishedAt:new Date().toISOString(),exitCode:run.code,passed,result});
  await writeFile(path.join(out, `${name}.result.json`), JSON.stringify(results.at(-1),null,2));
  console.log(JSON.stringify({name,passed,checks:result?.checks?.length,error:result?.failure ?? (result ? undefined : run.output.slice(-1200))}));
}
await writeFile(path.join(out, 'latest-batch.json'), JSON.stringify(results,null,2));
if (results.some(result => !result.passed)) process.exitCode=1;
