export interface SceneCopy {
  title?: string;
  paragraphs?: Record<number, string>;
  choices?: Record<string, readonly [text: string, hint: string, feedback?: string]>;
  ending?: readonly [title: string, text: string];
}

export function sceneCopy(id: string, copy: SceneCopy): Record<string, string> {
  const result: Record<string, string> = {}, prefix = `nodes/${id}`;
  if (copy.title) result[`${prefix}/title`] = copy.title;
  for (const [index, text] of Object.entries(copy.paragraphs ?? {})) result[`${prefix}/text/${index}`] = text;
  for (const [choice, [text, hint, feedback]] of Object.entries(copy.choices ?? {})) {
    result[`${prefix}/choices/${choice}/text`] = text;
    result[`${prefix}/choices/${choice}/hint`] = hint;
    if (feedback !== undefined) result[`${prefix}/choices/${choice}/feedback`] = feedback;
  }
  if (copy.ending) {
    result[`${prefix}/ending/title`] = copy.ending[0];
    result[`${prefix}/ending/text`] = copy.ending[1];
  }
  return result;
}
