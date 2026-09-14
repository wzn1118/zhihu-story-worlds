import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Artwork, ArtworkActivity, type ArtworkState } from '../../src/Artwork';
import { artworkLoader, type ArtworkPriority } from '../../src/art-loader';
import { useArtPrefetch } from '../../src/use-art-prefetch';
import { configureAccountStorage } from '../../src/account-storage';

type Item = {
  id: string;
  key?: string;
  source: string;
  fallback?: string;
  priority?: ArtworkPriority;
  before?: number;
  details?: boolean;
};

type Config = {
  items?: Item[];
  active?: boolean;
  prefetch?: string[];
  prefetchEnabled?: boolean;
};

declare global {
  interface Window {
    renderArtFixture(config: Config): void;
    artFixtureStates: (ArtworkState & { id: string })[];
    artFixtureSnapshot: typeof artworkLoader.snapshot;
    resetArtFixture(): void;
    switchArtAccount(id: string): void;
  }
}

window.artFixtureStates = [];
const root = createRoot(document.getElementById('app')!);

function ItemView({ item }: { item: Item }) {
  const art = <div className="frame" data-frame={item.id}>
    <Artwork src={item.source} fallback={item.fallback} priority={item.priority} alt={item.id}
      onStateChange={state => window.artFixtureStates.push({ id: item.id, ...state })} />
  </div>;
  return <>
    {item.before ? <div style={{ height: item.before }} /> : null}
    {item.details ? <details data-details={item.id}><summary>Open {item.id}</summary>{art}</details> : art}
  </>;
}

function Fixture({ config }: { config: Config }) {
  useArtPrefetch(config.prefetch ?? [], config.prefetchEnabled ?? true);
  return <ArtworkActivity value={config.active ?? true}>
    {(config.items ?? []).map(item => <ItemView key={item.key ?? item.id} item={item} />)}
    <div style={{ height: 2200 }} />
  </ArtworkActivity>;
}

window.renderArtFixture = config => flushSync(() => root.render(<Fixture config={config} />));
window.artFixtureSnapshot = () => artworkLoader.snapshot();
window.resetArtFixture = () => { flushSync(() => root.render(null)); artworkLoader.reset(); };
window.switchArtAccount = id => configureAccountStorage({ provider: 'zhihu' }, id);
