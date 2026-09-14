import { useState } from 'react';
import type { Character, GameWorld } from '../shared/types';
import { approvedStagePortrait } from './character-cutouts';
import { versionedArtUrl } from './live-published-art';
import { BookJacket } from './BookJacket';
import './world-art-overview.css';

function CharacterReference({ character }: { character: Character }) {
  const portraits = [
    { label: '人物', url: character.portraits?.main ?? character.portrait ?? character.stagePortraits?.main?.url },
    { label: '表情', url: character.portraits?.reaction ?? character.stagePortraits?.reaction?.url },
    ...(['main', 'reaction'] as const).flatMap(expression => {
      const portrait = character.stagePortraits?.[expression];
      return approvedStagePortrait(portrait) ? [{ label: expression === 'main' ? '立绘' : '立绘表情', url: portrait.url }] : [];
    }),
  ].filter((entry, index, entries) => entry.url && entries.findIndex(other => other.url === entry.url) === index);
  const [selected, setSelected] = useState(0);
  const image = portraits[selected] ?? portraits[0];
  const stage = Object.values(character.stagePortraits ?? {}).find(portrait => approvedStagePortrait(portrait) && portrait.url === image?.url);
  const imageUrl = image?.url && versionedArtUrl(image.url, stage?.sha256);
  return <article className="character-mini character-reference" data-character-id={character.id}>
    {image && <div className="character-reference-art"><img key={imageUrl} src={imageUrl} loading="lazy" decoding="async" alt={`${character.name} · ${image.label}`} /></div>}
    <h4>{character.name}</h4><p>{character.role}<br />{character.description}</p>
    {portraits.length > 1 && <div className="character-reference-poses" aria-label={`${character.name}的形象`}>
      {portraits.map((portrait, index) => <button key={portrait.url} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>{portrait.label}</button>)}
    </div>}
  </article>;
}

/** Bound source portraits remain useful as character references before cutout review. */
export function WorldArtOverview({ world }: { world: GameWorld }) {
  const cast = [...world.characters, ...(world.artCharacters ?? [])];
  const [loadedCover, setLoadedCover] = useState<string>();
  return <section className="world-art-overview" aria-label="改编世界与人物">
    <figure className="world-adaptation-cover"><div className="world-cover-frame">
      {(!world.cover || loadedCover !== world.cover) && <BookJacket title={world.title} />}
      {world.cover && <img src={world.cover} loading="lazy" decoding="async" alt={`${world.title} · 改编封面`}
        style={{ visibility: loadedCover === world.cover ? 'visible' : 'hidden' }} onLoad={() => setLoadedCover(world.cover)} />}
    </div><figcaption>《{world.title}》· 互动改编</figcaption></figure>
    <div className="character-list">{cast.map(character => <CharacterReference key={`${world.id}:${character.id}`} character={character} />)}</div>
  </section>;
}
