import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiuKanShanAvatar, type LiuKanShanAvatarProps } from '../../src/LiuKanShanAvatar';
import { LiukanActionGallery } from '../../src/LiukanActionGallery';
import { LIUKAN_ACTIONS, performLiukanAction } from '../../src/liukan-actions';

const root = createRoot(document.getElementById('root')!);
const completed: string[] = [];
function render(props: LiuKanShanAvatarProps = {}, gallery = false) {
  root.render(<StrictMode><div data-testid="avatar"><LiuKanShanAvatar action="listen" eventTarget="pet" onComplete={action => completed.push(action)} {...props} /></div>{gallery && <LiukanActionGallery />}</StrictMode>);
}
Object.assign(window, { actionTest: { actions: LIUKAN_ACTIONS, completed, render, performLiukanAction, unmount: () => root.unmount() } });
render({ reducedMotion: true }, true);
