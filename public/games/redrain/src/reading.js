const sentences = new Intl.Segmenter("zh-CN", { granularity: "sentence" });

export function splitReadingText(text, limit = 160) {
  return text.split(/\n\s*\n/u).filter(Boolean).flatMap(paragraph => {
    const pages = [];
    let current = "";
    for (const { segment } of sentences.segment(paragraph)) {
      if (current && current.length + segment.length > limit) {
        pages.push(current);
        current = "";
      }
      current += segment;
    }
    if (current) pages.push(current);
    return pages;
  });
}

export function createReadingPages(scene, outcome = null) {
  const pages = splitReadingText(scene.body).map(text => ({ kind: "narrative", speaker: "旁白", text }));
  for (const line of scene.quote.split("\n").filter(Boolean)) {
    const separator = line.indexOf("：");
    const speaker = separator > 0 ? line.slice(0, separator) : "旁白";
    const text = separator > 0 ? line.slice(separator + 1) : line;
    pages.push(...splitReadingText(text).map(part => ({ kind: "dialogue", speaker, text: part })));
  }
  if (outcome) pages.push(...splitReadingText(outcome).map(text => ({ kind: "outcome", speaker: "行动结果", text })));
  return pages;
}
