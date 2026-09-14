const stage = process.argv[2];
const scripts: Record<string, string> = {
  export: './world-prose-export.ts',
  browser: './world-prose-browser.ts',
  skill: './world-prose-skill-client.mjs',
  verify: './world-prose-verify.ts',
};
if (!scripts[stage]) throw new Error('Expected export, browser, skill or verify');
Object.assign(process.env, {
  WORLD_PROSE_OUTPUT: 'output/world-continuation',
  WORLD_PROSE_BROWSER_OUTPUT: 'output/playwright/world-continuation-final',
  WORLD_PROSE_BASELINE: 'tests/fixtures/worlds-pre-continuation.json.gz',
  WORLD_PROSE_ENDINGS: '1',
  WORLD_PROSE_TEST_LOG: 'output/world-continuation/story-test-final.log',
  WORLD_PROSE_TEST_SCOPE: 'Core creative and all-world prose/continuation contracts',
  WORLD_PROSE_REPOSITORY_TEST_LOG: 'output/world-continuation/full-test-final.log',
  WORLD_PROSE_BUILD_LOG: 'output/world-continuation/build-final.log',
});
if (process.argv[3] === 'resume') process.env.WORLD_PROSE_RESUME = '1';
if (process.argv[3] === 'refresh') Object.assign(process.env, {
  WORLD_PROSE_RESUME: '1',
  WORLD_PROSE_PREVIOUS_MANIFEST: 'output/world-continuation/pre-owner-refresh-manifest.json',
  WORLD_PROSE_PREVIOUS_REPORT: 'output/world-continuation/pre-owner-refresh-browser.json',
});
await import(scripts[stage]);
export {};
