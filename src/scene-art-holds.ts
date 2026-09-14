// The sick-camp review requested local scenery at these two nodes while their
// existing scene illustrations are checked. A newly approved replacement URL
// automatically clears the hold; no catalogue review is changed here.
const heldSceneUrls: Record<string, string> = {
  'ming-whisper:escort_muster': '/generated-art/scene_086b9e5b34a5b16237dac27aaaf8.png',
  'ming-whisper:escort_sickcamp': '/generated-art/scene_77a0a48958feec2683d35c5faa67.png',
};

export function hasSceneArtHold(worldId: string, nodeId: string, source?: string): boolean {
  return Boolean(source && heldSceneUrls[`${worldId}:${nodeId}`] === source);
}
