/**
 * Scoped high-confidence secret/size audit of Git-index-selected files.
 * Never outputs matched credentials; a clean result is not a security guarantee.
 */
import fs from 'node:fs/promises';
import {presentTrackedFiles,selectWorkingFiles} from './review-package-lib.mjs';
if(process.argv.slice(2).some(a=>a!=='--working'))throw Error('Only --working is supported');
const indexed=presentTrackedFiles();
// Include selected new planner files, but still audit tracked sensitive names even if copying excludes them.
const files=[...new Set([...indexed,...(process.argv.includes('--working')?selectWorkingFiles():[])])];
const findings=[],patterns=[
 ['github-token',/\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/g],
 ['openai-key',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/g],
 ['aws-access-key',/\bAKIA[0-9A-Z]{16}\b/g],
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
];
let textFiles=0,bytes=0;const largest=[];
for(const file of files){
 const b=await fs.readFile(file);bytes+=b.length;largest.push({file,bytes:b.length});
 if(b.length>100*1024*1024)findings.push({file,kind:'github-file-size'});
 if(/(^|\/)(\.env(?:\.|$)|id_rsa$|id_ed25519$)|\.(?:pfx|p12|session)$/i.test(file))findings.push({file,kind:'sensitive-file-name'});
 if(b.includes(0)||b.length>16*1024*1024)continue;
 textFiles++;const content=b.toString('utf8');
 for(const [kind,re]of patterns){re.lastIndex=0;if(re.test(content))findings.push({file,kind});}
}
const report={schemaVersion:1,checkedAt:new Date().toISOString(),status:findings.length?'review-required':'pass',selectedFiles:files.length,textFiles,bytes,patterns:patterns.map(([kind])=>kind),findings,largest:largest.sort((a,b)=>b.bytes-a.bytes).slice(0,8),claimBoundary:'Heuristic scan of selected paths, not a comprehensive secret scanner, malware scan or penetration test. No matched content emitted.'};
console.log(JSON.stringify(report,null,2));if(findings.length)process.exitCode=1;
