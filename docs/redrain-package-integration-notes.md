# RedRain main text adventure package

The shipped entry is `/games/redrain/index.html`; embedded playback uses `?embedded=1&session=<id>` and channel `redleaf:redrain:v1`. The child waits for a validated host restore before rendering or saving and does not read or write legacy browser storage while embedded. Standalone playback retains the original local storage behavior.

Packaging command: `node scripts/package-redrain.mjs [source-directory]`. It walks the main module graph, literal asset URLs and resolved decision/audio/approved-art exports. The output includes 317 source files totaling 541,002,798 bytes before integration additions; files are SHA-256 accounted in `redrain-package-inventory.json`. No alternate-game directory, alternate entry, runtime binary, provider receipt or private release metadata is copied. The original content and route modules are unchanged.

Some original decision exports still list obsolete portrait URLs missing from the source distribution. These are recorded as `absentSourceReferences`; the actual portrait selector accepts reviewed sources only. All 213 reviewed asset bindings and all 50 active decision background/prop pairs exist in the package. This check covers file availability, not new artwork approval or every possible story path.

Embedded playback supports restore, checkpoints, save acknowledgments, exit with the last checkpoint request ID, settings, pause/resume, source and restart commands. The host owns persistent saves. A failed save acknowledgement unpauses the child, preserving the ability to retry. Local music volume/settings and failure records remain available through the original in-game settings control.

The prologue reading body scrolls independently while its next/back buttons remain visible. Verified at 1440×1000 and 390×844; mobile next button bounds are x=14, y=782, width=357, height=44. Browser interaction verified chapter reading, first choice, checkpoint, pause/resume, exit and iframe reload restoring route, outcome and reading cursor. `output/redrain-package-qa/report.json` records zero page/network errors for this scope. Screenshots were opened and reviewed.

The supplied develop-web-game client ran against the standalone page and advanced to prologue page 2 without errors. Its screenshot captures the decorative canvas only, so the DOM interface was separately validated with full-page Playwright screenshots in `output/redrain-package-qa/`.
