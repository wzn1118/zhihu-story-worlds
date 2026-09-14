import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ZhihuBrowserService } from '../server/zhihu-browser.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';
test('loading more advances the real question page to its end and captures each newly loaded answer', async t => {
  const root = await mkdtemp(join(tmpdir(),'question-native-more-'));
  const launch = chromium.launchPersistentContext;
  t.mock.method(chromium,'launchPersistentContext',async (...args:Parameters<typeof chromium.launchPersistentContext>)=>{
    const context=await launch.call(chromium,...args);
    await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1 class="QuestionHeader-title">问题测试</h1><main></main><script>
const add=n=>document.querySelector('main').insertAdjacentHTML('beforeend','<article class="AnswerItem" style="height:1800px" data-answer-id="1234567'+n+'"><b class="AuthorInfo-name">作者'+n+'</b><div class="RichContent"><div class="RichContent-inner"><div class="RichText">第'+n+'条实际网页正文。</div></div></div></article>');add(1);add(2);let added=false;addEventListener('scroll',()=>{if(!added&&scrollY+innerHeight>=document.documentElement.scrollHeight-12){added=true;setTimeout(()=>add(3),150)}});
</script>`}));return context;
  });
  const service=new ZhihuBrowserService(new ZhihuDiscoveryService(join(root,'sources')),join(root,'profile'),{defaultChannel:'chromium'});
  try{
    const first=await service.open({url:'https://www.zhihu.com/question/12345678',width:1000,height:700});assert.equal(first.posts.length,2);
    const next=await service.action({kind:'load-more'});assert.equal(next.posts.length,3);assert.equal(new Set(next.posts.map(p=>p.sourceUrl)).size,3);
    for(const post of next.posts){const capture=await service.capture({postId:post.id,frameId:next.frameId});assert.equal(capture.origin.sourceUrl,post.sourceUrl);assert.equal(capture.excerpt,post.excerpt);}
    const earlier=await service.capture({postId:first.posts[0].id,frameId:first.frameId});assert.equal(earlier.excerpt,'第1条实际网页正文。');
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
