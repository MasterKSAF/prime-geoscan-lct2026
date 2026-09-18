import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
const execute=promisify(execFile);
const directory=process.argv[2]??'output/mission-docker-verification';
// Optional explicit container ID/name supports any Compose project name.
const containerId=process.argv[3]??'lct-planner-1';
const report=JSON.parse(await readFile(`${directory}/report.json`,'utf8')) as {sourceHashes:Record<string,string>};
const {stdout}=await execute('docker',['inspect',containerId]);
const container=JSON.parse(stdout)[0] as {
 Id:string;Image:string;Created:string;
 Config:{User:string};State:{Status:string;Health?:{Status:string}};
 HostConfig:{Memory:number;NanoCpus:number;CapDrop:string[];SecurityOpt:string[];PortBindings:unknown}
};
const paths=Object.keys(report.sourceHashes).filter(path=>/^(lib\/|components\/|app\/|package(-lock)?\.json$)/.test(path));
const code=`const fs=require('node:fs'),crypto=require('node:crypto');console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(paths)}.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync('/app/'+p)).digest('hex')]))));`;
const measured=JSON.parse((await execute('docker',['exec',containerId,'node','-e',code])).stdout) as Record<string,string>;
const mismatches=paths.filter(path=>measured[path]!==report.sourceHashes[path]);
const runtime={capturedAt:new Date().toISOString(),containerId:container.Id,imageId:container.Image,createdAt:container.Created,status:container.State.Status,health:container.State.Health?.Status,
 user:container.Config.User,memoryBytes:container.HostConfig.Memory,cpus:container.HostConfig.NanoCpus/1e9,ports:container.HostConfig.PortBindings,
 capabilitiesDropped:container.HostConfig.CapDrop,securityOptions:container.HostConfig.SecurityOpt,
 sourceComparison:{compared:paths.length,mismatches,containerHashes:measured},
 scope:'Measured local Docker instance; not a public deployment or clean release certification.'};
await writeFile(`${directory}/runtime.json`,JSON.stringify(runtime,null,2));
console.log(JSON.stringify({file:`${directory}/runtime.json`,imageId:runtime.imageId,health:runtime.health,cpus:runtime.cpus,memoryBytes:runtime.memoryBytes,compared:paths.length,mismatches},null,2));
if(mismatches.length||runtime.status!=='running')process.exitCode=1;
