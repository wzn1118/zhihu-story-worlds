# Liu Kanshan first-visit guide

Owner: liukan_onboarding; acceptance follow-up: liukan_guide_accept. 2026-09-12. Component and focused checks are complete; root owns integrated browser acceptance.

## Integration

New component: `LiukanTour` from `src/LiukanTour.tsx`.

```tsx
const [tourOpen, setTourOpen] = useState(() => shouldShowLiukanTour());
<button onClick={() => setTourOpen(true)}>怎么开始</button>
<LiukanTour open={tourOpen} onClose={() => setTourOpen(false)} onNavigate={navigateTour} />
```

Props: `open: boolean`, `onClose(reason: 'complete' | 'later'): void`, `onNavigate(view: LiukanTourView): void`, optional `reducedMotion: boolean`.
Optional `onStepChange(step: LiukanTourStep)` lets the root reveal the relevant workshop tab before measurement; the same step is dispatched as `redleaf:liukan-tour-step` (null on dismissal). In particular, step `import` should show the paste tab, and step `generate` should retain that tab. The tour never clicks a control to reveal it.
`LiukanTourView = 'library' | 'workshop' | 'saves' | 'settings' | 'endings' | 'zhihu'`.
`shouldShowLiukanTour()` is exported by `src/liukan-tour.ts`; it safely reads local storage. Closing or completing records this version as seen. Reopening always starts at the introduction. Mount at the app root, outside route conditionals. Root retains all actual application navigation and all generation actions.

Stable target attributes to add: `data-tour="liukan-pet"`, `library-games`, `library-play`, `library-source`, `workshop-entry`, `workshop-zhihu-browser`, `workshop-source-input`, `workshop-relay`, `workshop-generate`, `workshop-projects`, `workshop-art`, `game-saves`, `game-endings`, `app-settings`. Optional `zhihu-reader` highlights the actual embedded real browser when already displayed. Missing targets fall back to an existing module and then the centered guide without blocking.

The guide only changes application views and scrolls existing elements. It never starts creative/image jobs, edits imported sources, or claims production progress. Original supplied animation assets under `/assets/liukan/` are reused, with static PNG frames for reduced motion.

Fourteen short steps cover first play, source attribution, workshop, in-page Zhihu, original imports, relay configuration, actual generation, persisted status/retry, independent art status, saves, ending recall and settings. Fourteen distinct actions from the shared 56-action catalogue are used through `LiuKanShanAvatar`, with motion preferences respected. These actions reuse the supplied character art; they are not fourteen new source animations. Escape postpones, arrow keys navigate, and Tab remains inside the card. Every reopened guide starts again at the introduction.

Large/offscreen modules receive bounded highlights; a missing target falls back to an existing module or a centered card. Desktop/mobile card placement prefers a clear view of the highlighted control. There are no network calls or generation mutations in these files.

Validation: `node --import tsx --test tests/liukan-tour.test.ts` passed 6/6. `node node_modules/typescript/bin/tsc --noEmit --pretty false` passed at this checkpoint. Tests check durable first-visit state, unavailable browser storage, desktop/mobile/short-landscape card bounds, target/card separation, offscreen highlights, and existence of every referenced original GIF/PNG pair.

Pending: root App/StoryWorkshop/Pet integration, real-browser keyboard/first-visit/replay checks and screenshots. No shared server restart and no commit.


## 2026-09-12 guide acceptance follow-up

The public component props and `redleaf:liukan-tour-step` event name are unchanged.
`LiukanTourStep.action` now uses `LiukanActionId` from `src/liukan-actions.ts`;
consumers should use it directly rather than the former five raw asset names.
The guide owns its own `LiuKanShanAvatar` with no global event target, so the
floating pet and guide do not race for animation playback. Each step receives
its own `playKey` and reduced-motion preference.

Current step/action map: hello/hello, library/look-around, play/show-play,
source/show-reader, workshop/show-workshop, zhihu/receive-answer,
import/read-carefully, relay/show-settings, generate/make-game,
progress/check-story, art/draw-scene, saves/remember,
endings/recall-ending, settings/try-it.

Corrected the import label to the actual “粘贴或上传” tab. Where a module and
its navigation shortcut share a target, the visible module later in the DOM
now wins. Target ResizeObserver updates cover layout reflow as well as window
resize, scroll, and application mutations. The application root is temporarily
inert while the portal guide is visible; keyboard and programmatic focus stay
inside the guide, and the previous inert state/focus are restored on dismissal.
Every unmount clears the shared step event. Desktop maximum card height now
matches its placement margins, and original animated/static character files
use the shared Avatar without conflicting image dimensions at smaller sizes.

Validation completed in this follow-up:
- `node --import tsx --test tests/liukan-tour.test.ts tests/liukan-actions.test.ts`: 11/11 passed (6 guide, 5 shared action checks).
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed.
- The 14 guide actions resolve to existing supplied GIF/PNG pairs; shared action checks verify all six GIF hashes and 320×320 static PNGs.

No browser screenshot is claimed by this lane. Root must still inspect the
integrated desktop/mobile guide, first visit/replay, actual target rectangles,
and absence of generation requests during the guide. No shared server restart,
paid image request, generated game, credential access or commit occurred here.
