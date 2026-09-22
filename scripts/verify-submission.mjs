/**
 * Release integrity and scoped local-link validation, no npm dependencies.
 * --write-manifest snapshots Git-index file selection from the working tree.
 * Review/stage intended files first; default verification also works in a ZIP.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(), manifestPath='docs/planner/submission/evidence/artifact-manifest.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const safe=p=>{
 if(typeof p!=='string'||p.includes('\\')||path.isAbsolute(p)||p.split('/').includes('..'))throw Error('Unsafe path');
 const f=path.resolve(root,p);
 if(!f.startsWith(root+path.sep))throw Error('Outside repository');
 return f;
};
const currentDocs=['README.md','docs/planner/README.md','docs/planner/submission/README.md','docs/planner/submission/SOLUTION-PASSPORT.md','docs/planner/submission/INTERFACE-GUIDE.md','docs/planner/submission/DEMO-SCRIPT.md','docs/planner/submission/REVIEW-CHECKLIST.md','docs/planner/submission/REQUIREMENTS-AND-EVIDENCE.md','docs/planner/submission/KNOWN-LIMITATIONS.md','docs/planner/submission/VERIFICATION.md','docs/planner/submission/THIRD-PARTY-NOTICES.md','docs/planner/submission/presentation/BUILD.md'];
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
const manifest=JSON.parse(await fs.readFile(safe(manifestPath),'utf8')),failures=[];
if(manifest.treeSha256!==hash(JSON.stringify(manifest.files)))failures.push('MANIFEST_TREE_HASH');
for(const f of manifest.files){
 try {const b=await fs.readFile(safe(f.path));if(b.length!==f.bytes||hash(b)!==f.sha256)failures.push('HASH '+f.path);}
 catch(e){failures.push('MISSING '+f.path);}
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
const report={schemaVersion:1,checkedAt:new Date().toISOString(),status:failures.length?'fail':'pass',releaseId:manifest.releaseId,files:manifest.files.length,localLinks,treeSha256:manifest.treeSha256,failures,claimBoundary:'Integrity and existence of scoped documentation links; not functional correctness, absence of all secrets, or flight certification.'};
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
