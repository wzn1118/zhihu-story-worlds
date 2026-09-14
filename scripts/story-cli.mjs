import { tsImport } from 'tsx/esm/api';

const { main } = await tsImport('./story-commands.ts', import.meta.url);
await main();
