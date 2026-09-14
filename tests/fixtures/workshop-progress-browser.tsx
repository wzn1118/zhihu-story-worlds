import { createRoot } from 'react-dom/client';
import { configureAccountStorage } from '../../src/account-storage';

configureAccountStorage({ provider: 'local' }, null);
const query = new URLSearchParams(location.search);
const { StoryWorkshop } = query.get('release') === '1'
  ? await import('../../releases/oauth-20260914/src/StoryWorkshop')
  : await import('../../src/StoryWorkshop');
createRoot(document.getElementById('root')!).render(<StoryWorkshop
  stories={[]} requestedSource={null} requestedProjectId={query.get('selected')}
  onPlay={() => {}} onRead={() => {}} onReadZhihu={() => {}}
/>);
