import { parseArgs } from 'node:util';
import { StorySourceError, StorySourceService } from '../server/story-source.ts';

export const HELP = `Project-local adapter for the public Zhihu hackathon content API.
These are project commands, not official zhihu-cli subcommands.

Usage:
  node scripts/story-cli.mjs list [--genre <label>] [--query <text>] [--limit <1-100>]
  node scripts/story-cli.mjs get <story-id>
  node scripts/story-cli.mjs --help

Output is JSON with real source attribution, source mode and fetch time.
List filters apply to the returned source catalog. Get returns the API excerpt.
`;

export async function runStoryCli(argv: string[], service: Pick<StorySourceService, 'list' | 'detail'>, output: Pick<Console, 'log' | 'error'> = console): Promise<number> {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      help: { type: 'boolean', short: 'h' },
      genre: { type: 'string' }, query: { type: 'string' }, limit: { type: 'string' },
    } });
  } catch {
    output.error(HELP);
    return 2;
  }
  if (args.values.help) { output.log(HELP); return 0; }
  const [command, id, ...extra] = args.positionals;
  const { genre, query, limit } = args.values;
  const count = limit === undefined ? undefined : Number(limit);
  const invalid = !['list', 'get'].includes(command) || extra.length
    || (command === 'list' && id) || (command === 'get' && (!id || genre !== undefined || query !== undefined || limit !== undefined))
    || (limit !== undefined && (!/^\d+$/.test(limit) || !Number.isInteger(count) || count! < 1 || count! > 100));
  if (invalid) { output.error(HELP); return 2; }
  try {
    if (command === 'list') {
      const result = await service.list(true);
      const search = query?.trim().toLocaleLowerCase('zh-CN');
      const filtered = result.stories.filter(story => (!genre?.trim() || story.labels.includes(genre.trim()))
        && (!search || [story.title, story.description, story.author ?? ''].join('\n').toLocaleLowerCase('zh-CN').includes(search)));
      output.log(JSON.stringify({ ...result, stories: count === undefined ? filtered : filtered.slice(0, count) }, null, 2));
    } else {
      output.log(JSON.stringify(await service.detail(id, true), null, 2));
    }
    return 0;
  } catch (error) {
    const safe = error instanceof StorySourceError ? error : { code: 'INTERNAL_ERROR', status: 500, message: 'The story request failed.' };
    output.error(JSON.stringify({ error: { code: safe.code, status: safe.status, message: safe.message } }, null, 2));
    return 1;
  }
}

export async function main(argv = process.argv.slice(2)) {
  process.exitCode = await runStoryCli(argv, new StorySourceService());
}
