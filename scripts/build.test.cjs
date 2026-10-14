const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const expected=['index.html','privacy.html','kit.html','one-tiny-win.html',
'Pause90_One_Tiny_Win_Sample_v1.pdf','one-tiny-win-preview.png',
'pocket-reset-kit-preview.png','make-a-task-smaller.html','sitemap.xml',
'759d9d15023d4a54875c45e4e2fff712.txt'];
function tempSite(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pause90-build-test-'));
 fs.mkdirSync(path.join(tmp,'scripts'));
 fs.mkdirSync(path.join(tmp,'private-products'));
 // Use fixture hashes, never include real commercial product bytes in Git or tests.
 const planner=Buffer.from('%PDF-mock-solo-planner');
 const kit=Buffer.from('PK\x03\x04mock-client-ready-kit');
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 let build=fs.readFileSync(path.join(root,'scripts/build.cjs'),'utf8');
 build=build.replace('51049e292f1ffd75900ec102b71571478ecc231e0c8c90c1711c1dcbcdba4258',sha(planner))
            .replace('ea4666ab15a7f7413d465fa4cb8725d6774358679c1c3be3118d4d81a4aff7b6',sha(kit));
 fs.writeFileSync(path.join(tmp,'scripts/build.cjs'),build);
 fs.writeFileSync(path.join(tmp,'private-products','solo-income-planner.pdf'),planner);
 fs.writeFileSync(path.join(tmp,'private-products','client-ready-kickoff-kit.zip'),kit);
 for(const name of expected)fs.writeFileSync(path.join(tmp,name),'STATIC');
 for(const name of ['one-tiny-win.pdf','pocket-reset-kit.pdf'])
   fs.writeFileSync(path.join(tmp,'private-products',name),'%PDF-mock');
 return tmp;
}
test('build includes public allowlist and excludes all paid files and APIs',()=>{
 const tmp=tempSite();
 try{
   fs.mkdirSync(path.join(tmp,'public'));
   fs.writeFileSync(path.join(tmp,'public','leaked-paid-product.pdf'),'%PDF-stale');
   const result=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/build.cjs')],{encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
   assert.deepEqual(fs.readdirSync(path.join(tmp,'public')).sort(),expected.slice().sort());
 } finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('build refuses changed paid asset',()=>{
 const tmp=tempSite();
 try{
   fs.writeFileSync(path.join(tmp,'private-products','solo-income-planner.pdf'),'%PDF-fake');
   const result=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/build.cjs')],{encoding:'utf8'});
   assert.notEqual(result.status,0);
 } finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
