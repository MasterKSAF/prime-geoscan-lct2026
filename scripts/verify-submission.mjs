/**
 * Release integrity and scoped local-link validation, no npm dependencies.
 * --write-manifest snapshots Git-index file selection from the working tree.
 * Review/stage intended files first; default verification also works in a ZIP.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),docsOnly=args.includes('--docs-only');
if(args.some(a=>!['--docs-only','--write-manifest'].includes(a))||(docsOnly&&args.includes('--write-manifest')))throw Error('Use --docs-only or --write-manifest separately');
const root=process.cwd(), manifestPath='docs/planner/submission/evidence/artifact-manifest.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const safe=p=>{
 if(typeof p!=='string'||p.includes('\\')||path.isAbsolute(p)||p.split('/').includes('..'))throw Error('Unsafe path');
 const f=path.resolve(root,p);
 if(!f.startsWith(root+path.sep))throw Error('Outside repository');
 return f;
};
const documentation=JSON.parse(await fs.readFile(safe('docs/planner/documentation-manifest.json'),'utf8'));
const currentDocs=documentation.currentDocs;
if(documentation.schemaVersion!==1||!Array.isArray(currentDocs)||!currentDocs.length||new Set(currentDocs).size!==currentDocs.length)throw Error('Invalid documentation manifest');
for(const doc of currentDocs){safe(doc);if(!doc.endsWith('.md'))throw Error('Expected a Markdown guide');}
if(process.argv.includes('--write-manifest')){
 const unstaged=execFileSync('git',['diff','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(f=>f&&f!==manifestPath);
 if(unstaged.length)throw Error('Stage intended tracked changes first; unstaged files: '+unstaged.join(', '));
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(f=>f!==manifestPath).sort();
 const entries=[];
 for(const file of files){const b=await fs.readFile(safe(file));entries.push({path:file,bytes:b.length,sha256:hash(b)});}
 const release=JSON.parse(await fs.readFile(safe('docs/planner/submission-manifest.json'),'utf8'));
 const manifest={schemaVersion:1,releaseId:release.release_id,generatedAt:new Date().toISOString(),scope:'All Git-index-selected files except this self-referential manifest. Historical files retain historical claims.',treeSha256:hash(JSON.stringify(entries)),files:entries};
 await fs.writeFile(safe(manifestPath),JSON.stringify(manifest,null,2)+'\n');
}
const manifest=docsOnly?null:JSON.parse(await fs.readFile(safe(manifestPath),'utf8')),failures=[];
const engineSource=await fs.readFile(safe('lib/planner/mission-schema.ts'),'utf8');
const engineVersion=engineSource.match(/MISSION_ENGINE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if(!engineVersion||documentation.missionEngineVersion!==engineVersion)failures.push('DOCUMENTATION_ENGINE_VERSION');
if(manifest&&manifest.treeSha256!==hash(JSON.stringify(manifest.files)))failures.push('MANIFEST_TREE_HASH');
for(const f of manifest?.files??[]){
 try {const b=await fs.readFile(safe(f.path));if(b.length!==f.bytes||hash(b)!==f.sha256)failures.push('HASH '+f.path);}
 catch{failures.push('MISSING '+f.path);}
}
let localLinks=0;
for(const doc of currentDocs){
 const text=await fs.readFile(safe(doc),'utf8');
 for(const match of text.matchAll(/!?\[[^\]]*\]\((?:<)?([^)\s>]+)(?:>)?(?:\s+"[^"]*")?\)/g)){
  const ref=decodeURIComponent(match[1].split('#')[0]);
  if(!ref||/^[a-z][a-z0-9+.-]*:/i.test(ref))continue;
  localLinks++;
  const file=path.resolve(root,path.dirname(doc),ref);
  if(!file.startsWith(root+path.sep)){failures.push('LINK_OUTSIDE '+doc+' -> '+ref);continue;}
  try{await fs.access(file);}catch{failures.push('BROKEN_LINK '+doc+' -> '+ref);}
 }
}
const report={schemaVersion:1,checkedAt:new Date().toISOString(),mode:docsOnly?'working-docs-only':'strict-release-integrity',status:failures.length?'fail':'pass',releaseId:manifest?.releaseId??null,files:manifest?.files.length??null,documents:currentDocs.length,missionEngineVersion:engineVersion,localLinks,treeSha256:manifest?.treeSha256??null,failures,claimBoundary:docsOnly?'Scoped documentation links and engine-version consistency only; NOT release integrity, test freshness or submission readiness.':'Integrity and existence of scoped documentation links; not functional correctness, absence of all secrets, or flight certification.'};
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
