import type { LiukanReadingNote, LiukanReadingSkillId } from '../shared/liukan-reading';

export function readingFingerprint(skill: LiukanReadingSkillId, postIds: string[], question: string, parentNoteId?: string) {
  // Omitting an absent parent preserves the original session request keys, including uncertain requests.
  return JSON.stringify({ skill, postIds: [...postIds].sort(), question: question.trim(), ...(parentNoteId ? { parentNoteId } : {}) });
}

export function sourceScope(value: string | undefined) { return value === 'question-answer-excerpt' ? '知乎回答接口节选' : value === 'webpage-selection' ? '知乎网页选取' : value === 'search-excerpt' ? '知乎搜索节选' : '已保存的原文节选'; }

export function readingNoteMarkdown(note: LiukanReadingNote, parent?: Pick<LiukanReadingNote, 'id' | 'title'>) {
  const lines = [`# ${note.title}`, '', `> ${note.invented ? '改编草稿：含新创作的情节或对白，不属于原文。' : '阅读手记：基于已保存的原文节选。'}`, '', note.summary, ''];
  if (note.parentNoteId) lines.push(`续读自：${parent?.id === note.parentNoteId ? parent.title : '上一页阅读手记'}`, `前页编号：${note.parentNoteId}`, '前页是看山写的手记，仅作为讨论背景；原文证据仍以本页引文为准。', '');
  if (note.question) lines.push('## 这次的问题', '', note.question, '');
  for (const section of note.sections) {
    lines.push(`## ${section.heading}`, '', section.body, '');
    for (const evidence of section.evidence) {
      const source = note.sources.find(item => item.postId === evidence.postId);
      lines.push(...evidence.quote.split('\n').map(line => `> ${line}`), '', `引自：${source?.title ?? '已保存原文'}${source ? ` · ${source.author}` : ''}`, '');
    }
  }
  lines.push('## 阅读来源', '');
  for (const source of note.sources) lines.push(`- ${source.title} · ${source.author}`, `  ${source.sourceUrl}`, `  ${sourceScope(source.contentScope)}；${source.complete ? '本次阅读覆盖全部已保存文字' : '本次阅读仅使用部分已保存文字'}${source.current ? '' : '；原文已变更，手记保留生成时内容'}`);
  lines.push('', `手记保存于 ${note.createdAt} · ${note.model} · ${note.source === 'relay' ? '中转模型' : '知乎直答'}`, '');
  return lines.join('\n');
}
