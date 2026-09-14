import { runCreative } from '../server/workshop-creative.ts';
const result = await runCreative('.local/story-workshop/diagnostics', 'structured-isolated-probe', {
  type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } },
}, 'Return only the JSON object required by the output schema, status ok. Do not use any tools. This is a structured transport probe.');
console.log(JSON.stringify(result));
