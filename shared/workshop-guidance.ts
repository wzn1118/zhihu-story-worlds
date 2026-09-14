/** Application instructions, not generated fiction. Keep them tied to actual Ink behavior. */
export const workshopRuntimeGuidance = '选项下会写出要花多少资源；缺了线索或余量不够，就会锁住。线索要在故事里找到，列出的条件需要全部满足。走投无路时仍能选，但结果可能很坏。余量归零不会自动跳过场景。想换一条路，可以回到之前的选择，或从序章重来。';

/** The full AI outline stays on disk. The player introduction excludes production metadata. */
export function playerIntroduction(paragraphs: string[]): string[] {
  return paragraphs.filter(text => !/facts\.quote|OUTLINE_DATA|USER_SOURCE_DATA|CURRENT_ROUTE_DATA/.test(text));
}
