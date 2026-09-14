import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImageLauncher, imageLaunchId } from '../server/workshop-image-launch.ts';
import { createWorkshopImageService } from '../server/workshop-images.ts';
import type { GameWorld } from '../shared/types.ts';

const world = (): GameWorld => ({ id:'world-fast', storyId:'import-fast', version:'r1', title:'Fixture', characters:[], source:{title:'fixture',author:'fixture',url:''},
  nodes:Object.fromEntries(Array.from({length:40},(_,i)=>[String(i),{id:String(i),title:`Fixture ${i}`,location:'room',chapter:'',time:'',text:[`Text ${i}`],background:'',choices:[],artBrief:'Fixture scene direction only.'}])) } as unknown as GameWorld);
async function setup(t: {after:(fn:()=>Promise<void>)=>void}) {
 const root=await mkdtemp(join(tmpdir(),'workshop-launch-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const images=createWorkshopImageService({root,startWorker:()=>{}});
 return {root,images};
}
test('launch returns before creative work; double click shares ownership; first group starts while the rest is pending',async t=>{
 const {root,images}=await setup(t);let starts=0,token='',requested='';let unblock!:()=>void,ready!:()=>void;
 const gate=new Promise<void>(r=>unblock=r), first=new Promise<void>(r=>ready=r);
 const launcher=createImageLauncher({root,images,start:async(id,key)=>{starts++;token=key;requested=id;return process.pid;},direct:async(_w,onGroup)=>{
   const a={'0':'First real-model-shaped fixture prompt.'};await onGroup!(a);ready();await gate;
   const b=Object.fromEntries(Array.from({length:39},(_,i)=>[String(i+1),`Fixture prompt ${i}`]));await onGroup!(b);return {...a,...b};
 }});
 const w=world();const [a,b]=await Promise.all([launcher.start(w),launcher.start(w)]);assert.equal(a.id,b.id);assert.equal(starts,1);
 assert.equal((await images.listImages()).length,0);
 const running=launcher.run(requested,token);await first;
 const mid=await launcher.get(w);assert.equal(mid!.directed,1);assert.equal(mid!.total,40);assert.equal(mid!.state,'generating');assert.equal(mid!.progress!.paidAttemptsTotal,0);
 assert.equal((await images.listImages())[0].jobs.length,1);assert.equal(mid!.progress!.required,40);
 unblock();await running;const last=await launcher.get(w);assert.equal(last!.directed,40);assert.equal(last!.progress!.stale,0);assert.equal(last!.progress!.required,40);
 assert.equal(last!.progress!.queued,40);
});
test('failed direction can resume stored groups; pause is preserved when the next group arrives',async t=>{
 const {root,images}=await setup(t);let token='',id='',pass=0;
 const launcher=createImageLauncher({root,images,start:async(i,key)=>{id=i;token=key;return process.pid;},direct:async(_w,onGroup)=>{
  await onGroup!({'0':'Stable fixture prompt.'});if(!pass++)throw new Error('private upstream details');
  await images.pauseImages((await images.listImages())[0].id);
  await onGroup!({'1':'Second fixture prompt.'});return {'0':'Stable fixture prompt.','1':'Second fixture prompt.'};
 }});
 const w=world();await launcher.start(w);await launcher.run(id,token);const failed=await launcher.get(w);assert.equal(failed!.state,'failed');assert.doesNotMatch(JSON.stringify(failed),/private upstream/);
 const before=(await images.listImages())[0].jobs[0].id;
 await launcher.start(w);await launcher.run(id,token);const current=(await images.listImages())[0];assert.equal(current.jobs[0].id,before);assert.equal(current.state,'paused');assert.equal(current.progress.paidAttemptsTotal,0);
});
test('an existing complete manifest bypasses direction and never resubmits an unknown paid outcome',async t=>{
 const {root,images}=await setup(t);const w=world();const batch=await images.prepareImages(w);let id='',token='';
 const file=join(root,'output/workshop-images/.private/state.json'),store=JSON.parse(await readFile(file,'utf8'));
 store.batches[0].jobs.forEach((j:any)=>{j.paidAttempts=1;j.state='unknown_outcome';});await writeFile(file,JSON.stringify(store));
 const launcher=createImageLauncher({root,images,start:async(i,k)=>{id=i;token=k;return process.pid;},direct:async()=>{throw new Error('Direction must not run');}});
 await launcher.start(w);await launcher.run(id,token);const current=await launcher.get(w);assert.equal(current!.directed,40);assert.equal(current!.state,'failed');assert.equal((await images.getImages(batch.id))!.progress.paidAttemptsTotal,40);
 assert.equal(await launcher.get({...w,version:'r2'}),null);assert.notEqual(imageLaunchId(w),imageLaunchId({...w,storyId:'import-other'}));
 assert.notEqual(imageLaunchId(w),imageLaunchId({...w,nodes:{...w.nodes,'0':{...w.nodes['0'],text:['Changed source']}}}));
});
test('dead launch owners are recoverable without replacing completed direction files',async t=>{
 const {root,images}=await setup(t);const w=world();const launcher=createImageLauncher({root,images,start:async()=>process.pid});const initial=await launcher.start(w);
 const dir=join(root,'output/workshop-images/.private/launches',initial.id);
 await writeFile(join(dir,'owner.json'),JSON.stringify({pid:2147483646,token:'old'}));assert.equal((await launcher.get(w))!.state,'interrupted');
 await launcher.start(w);assert.equal((await launcher.get(w))!.state,'preparing');
});
test('a fully delivered batch returns immediately without a worker or rewriting the world, and survives a new launcher',async t=>{
 const {root,images}=await setup(t),w=world();await images.prepareImages(w);
 const file=join(root,'output/workshop-images/.private/state.json'),store=JSON.parse(await readFile(file,'utf8'));
 store.batches[0].jobs.forEach((j:any)=>{j.state='resolution_mismatch';j.paidAttempts=1;j.asset={url:`/generated-art/workshop/${j.id}.png`,width:32,height:18,bytes:1,sha256:j.sourceHash,native4k:false,originalPixels:true,duplicate:false};});
 await writeFile(file,JSON.stringify(store));
 const launcher=createImageLauncher({root,images,start:async()=>{throw new Error('No worker for returned images');}});
 const reply=await launcher.start(w);assert.equal(reply.state,'review');assert.equal(reply.progress!.generated,40);
 await assert.rejects(readFile(join(root,'output/workshop-images/.private/launches',reply.id,'world.json')),{code:'ENOENT'});
 const next=createImageLauncher({root,images});assert.equal((await next.get(w))!.state,'review');assert.equal((await next.get(w))!.progress!.paidAttemptsTotal,40);
});
