// A deliberately small declarative vocabulary, shared by structured output and runtime validation.
export type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; minItems?: number; maxItems?: number; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; pattern?: string; enum?: (string | number | null)[]; anyOf?: Schema[] };
const s = (minLength = 1, maxLength = 2000): Schema => ({ type: 'string', minLength, maxLength });
const id: Schema = { ...s(1, 48), pattern: '^[a-z][a-z0-9_]*$' };
const arr = (items: Schema, minItems = 0, maxItems = 40): Schema => ({ type: 'array', items, minItems, maxItems });
const obj = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const num = (minimum: number, maximum: number): Schema => ({ type: 'integer', minimum, maximum });
const kind: Schema = { type: 'string', enum: ['good', 'bad'] };
export const outlineSchema = obj({
  title: s(2, 100), subtitle: s(2, 150), summary: s(40, 1200), introduction: arr(s(30, 1500), 2, 5), objective: s(15, 300),
  player: obj({ name: s(1, 40), role: s(3, 120) }), beginnerTip: s(50, 1000),
  facts: arr(obj({ quote: s(4, 800), fact: s(8, 500) }), 3, 12),
  characters: arr(obj({ id, name: s(1, 40), role: s(2, 100), description: s(30, 800), motive: s(20, 800) }), 2, 8),
  resources: arr(obj({ id, label: s(1, 20), initial: num(2, 20), min: { type: 'integer', enum: [0] }, max: num(2, 20), description: s(20, 500) }), 1, 2),
  // A revised 18-scene route retains at least 10 decisions and 2 resolved endings.
  routes: arr(obj({ id, title: s(2, 80), commitment: s(20, 350), premise: s(40, 1000), beats: arr(s(20, 800), 10, 16), endings: arr(obj({ id, title: s(2, 80), kind, resolution: s(80, 1800), cause: s(20, 400) }), 2, 8) }), 3, 3),
  opening: obj({ title: s(2, 100), location: s(2, 100), time: s(2, 60), text: arr(s(40, 1600), 2, 12) }),
});
export const routeSchema = obj({ routeId: id, entry: id, scenes: arr(obj({
  id, title: s(2, 100), location: s(2, 100), time: s(2, 60), speaker: s(1, 50),
  text: arr(s(30, 2200), 2, 5), purpose: s(20, 500), artBrief: s(40, 1400),
  choices: arr(obj({ id, text: s(6, 160), hint: s(12, 300), next: id, costs: arr(obj({ resource: id, delta: num(-10, 5) }), 0, 2), gains: arr(s(2, 80), 0, 8), needs: arr(s(2, 80), 0, 12), feedback: s(15, 400) }), 0, 14),
  ending: { anyOf: [{ type: 'null' }, obj({ kind, title: s(2, 100), resolution: s(100, 2200) })] },
}), 12, 18) });
export const routeRepairSchema: Schema = { ...routeSchema, properties: { ...routeSchema.properties, scenes: { ...routeSchema.properties!.scenes, minItems: 1 } } };

export function validateSchema(schema: Schema, value: unknown, path = '$'): void {
  if (schema.anyOf) {
    if (!schema.anyOf.some(option => { try { validateSchema(option, value, path); return true; } catch { return false; } })) throw new Error(`${path}: 格式不匹配`);
    return;
  }
  const fail = (message: string): never => { throw new Error(`${path}: ${message}`); };
  if (schema.enum && !schema.enum.includes(value as string)) fail('值超出约定范围');
  if (schema.type === 'null') { if (value !== null) fail('需要 null'); return; }
  if (schema.type === 'string') {
    if (typeof value !== 'string') fail('需要文本');
    const str = value as string;
    if (str.length < (schema.minLength ?? 0) || str.length > (schema.maxLength ?? Infinity) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(str) || (schema.pattern && !new RegExp(schema.pattern).test(str))) fail('文本长度/字符不符合约定');
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || Number(value) < (schema.minimum ?? -Infinity) || Number(value) > (schema.maximum ?? Infinity)) fail('数值越界');
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('需要数组');
    const items = value as unknown[];
    if (items.length < (schema.minItems ?? 0) || items.length > (schema.maxItems ?? Infinity)) fail('数组长度不符合约定');
    items.forEach((item, index) => validateSchema(schema.items!, item, `${path}[${index}]`));
  } else if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('需要对象');
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object)) if (!Object.hasOwn(schema.properties!, key)) fail(`未知字段 ${key}`);
    for (const key of schema.required ?? []) { if (!Object.hasOwn(object, key)) fail(`缺少 ${key}`); validateSchema(schema.properties![key], object[key], `${path}.${key}`); }
  }
}
