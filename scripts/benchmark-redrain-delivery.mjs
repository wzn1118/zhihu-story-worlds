import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { freshPlatformState } from '../public/games/redrain/src/platform-state.js';
const base = process.argv[2] || 'http://127.0.0.1:18082/games/redrain';
const label = process.argv[3] || 'v2';
const output = new URL('../output/redrain-performance-v2/', import.meta.url);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true});
const runs=[];
try {
  for (let run=0;run<3;run++) {
    const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const seed={...freshPlatformState(),mode:'game',tutorialSeen:true,readingCursor:{identity:'first-proof:',page:3,complete:true,reachedEnd:false}};
    await context.addInitScript(seed=>{
      localStorage.setItem('doomsday-45-degree-save-v2',JSON.stringify(seed));
      localStorage.setItem('doomsday-45-degree-reading-v1',JSON.stringify({speed:'instant',reducedMotion:true}));
      window.artReady=0;
      new MutationObserver(()=>{
        if(!window.artReady&&document.querySelector('#character-stage')?.dataset.status==='ready') window.artReady=performance.now();
      }).observe(document,{subtree:true,attributes:true,childList:true});
    },seed);
    const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:120,downloadThroughput:200000,uploadThroughput:100000});
    await page.goto(base+'/index.html',{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>window.artReady>0,null,{timeout:120000});
    const cold=await page.evaluate(()=>{
      const image=document.querySelector('#character-stage img');
      return {readyMs:Math.round(window.artReady),src:image.getAttribute('src'),decodedBytes:image.naturalWidth*image.naturalHeight*4,
        resources:performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.encodedBodySize,transferBytes:r.transferSize,decodedBytes:r.decodedBodySize,startMs:Math.round(r.startTime),durationMs:Math.round(r.duration)}))};
    });
    await page.waitForTimeout(4000);
    const nextSpeakerMs=await page.evaluate(()=>new Promise(resolve=>{
      const stage=document.querySelector('#character-stage'),start=performance.now();
      const observer=new MutationObserver(()=>{
        if(stage.dataset.status==='ready'&&stage.dataset.character==='楼绎'){
          observer.disconnect();requestAnimationFrame(()=>resolve(Math.round(performance.now()-start)));
        }
      });observer.observe(stage,{attributes:true,subtree:true,childList:true});
      document.querySelector('#reading-advance').click();
    }));
    assert.deepEqual(errors,[]);
    if(run===0) await page.screenshot({path:new URL(`${label}-desktop.png`,output).pathname});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.artReady>0);
    const warm=await page.evaluate(()=>({readyMs:Math.round(window.artReady),networkBytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.transferSize,0)}));
    runs.push({run,cold,nextSpeakerMs,warm,errors});
    await context.close();
    console.log(JSON.stringify({label,run,coldMs:cold.readyMs,nextSpeakerMs,warmMs:warm.readyMs,decodedPortraitBytes:cold.decodedBytes}));
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const summary={label,base,network:{latencyMs:120,downloadBytesPerSecond:200000},coldMedianMs:median(runs.map(r=>r.cold.readyMs)),nextSpeakerMedianMs:median(runs.map(r=>r.nextSpeakerMs)),warmMedianMs:median(runs.map(r=>r.warm.readyMs)),runs};
  await writeFile(new URL(`${label}-benchmark.json`,output),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({label,coldMedianMs:summary.coldMedianMs,nextSpeakerMedianMs:summary.nextSpeakerMedianMs,warmMedianMs:summary.warmMedianMs}));
}finally{await browser.close();}
