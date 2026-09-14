# Approved cutouts in gameplay

User: 续跑，开多线程把这些图片真实接入游戏。

Owners: cutout_runtime_binding owns binding helpers and tests; cutout_ui_integration owns App.tsx and character layout; root owns coverage, compiled preview, browser acceptance. Existing art workers/publishers retain PNGs and review files. Do not duplicate writers.

Baseline 16:53: 33 published approved cutouts; 21 attached to runtime characters, 37 potentially visible scene placements across 8 worlds, zero opening scenes displaying a cutout. Snapshot: output/coordination/cutout-game-integration-20260910/before-coverage.json.

Target: show approved transparent characters in matching source-backed scenes, including opening scenes where possible. Preserve authored node.character and story hash, but allow a separate stage choice when the authored portrait cannot display and another approved character is explicitly present. Do not add actors to scenes without presence evidence; do not overlay figures on complete scene CGs.

Also inspect the 12 approved reaction images omitted solely because the main pose is not approved: a fully approved transparent reaction is valid artwork for that same actor; a fallback may use that approved pose when identity, source hash, approval, and scene presence all match. Never fabricate a main approval or display an opaque source image as a cutout.

Root will rebuild the isolated compiled-game output behind 4173 and verify actual visible actors, interaction and screenshots on desktop/mobile. Handoffs should be short counts plus paths, with no full image history.
