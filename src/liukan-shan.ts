export interface PetPosition { x: number; y: number }
export const LIU_KAN_SHAN_POSITION_KEY = 'redleaf.liukanshan.position.v1';
export const LIU_KAN_SHAN_OPEN_KEY = 'redleaf.liukanshan.open.v1';

export function clampPetPosition(position: PetPosition, viewport: { width: number; height: number }, size = 88): PetPosition {
  const maxX = Math.max(8, viewport.width - size - 8);
  const maxY = Math.max(8, viewport.height - size - 8);
  return {
    x: Math.round(Math.min(Math.max(8, Number.isFinite(position.x) ? position.x : maxX), maxX)),
    y: Math.round(Math.min(Math.max(8, Number.isFinite(position.y) ? position.y : maxY), maxY)),
  };
}

export function avoidPetChoices(position: PetPosition, viewport: { width: number; height: number },
  choices: { left: number; top: number; right: number; bottom: number }): PetPosition {
  const current = clampPetPosition(position, viewport);
  // Include the avatar outside its 88 px pointer area and leave a reading gap.
  const clear = (p: PetPosition) => p.x + 106 <= choices.left || p.x - 18 >= choices.right
    || p.y + 100 <= choices.top || p.y - 26 >= choices.bottom;
  if (clear(current)) return current;
  const candidates = [
    { x: current.x, y: choices.top - 100 }, { x: current.x, y: choices.bottom + 26 },
    { x: choices.left - 106, y: current.y }, { x: choices.right + 18, y: current.y },
  ].map(p => clampPetPosition(p, viewport)).filter(clear);
  candidates.sort((a, b) => Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y));
  return candidates[0] ?? current;
}

export function petPanelPosition(position: PetPosition, viewport: { width: number; height: number }) {
  const pet = clampPetPosition(position, viewport);
  const width = Math.min(358, viewport.width - 24);
  // The animation extends 14 px above its hit area, so leave that space clear too.
  const above = Math.max(0, pet.y - 36);
  const belowTop = pet.y + 100;
  const below = Math.max(0, viewport.height - belowTop - 12);
  const placeAbove = above >= 320 || above >= below;
  const maxHeight = Math.min(620, placeAbove ? above : below);
  const top = placeAbove ? pet.y - 24 - maxHeight : belowTop;
  return { left: Math.min(Math.max(12, pet.x - width + 80), Math.max(12, viewport.width - width - 12)), width, top, maxHeight };
}
