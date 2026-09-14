# Cel Calibration V1

Trigger: user explicitly rejected the prior rental-apartment image as Korean
manhwa, and requested last-century Japanese anime such as Akira.

Output: `output/imagegen/cel-calibration-v1/cel-calibration-v1-01.png`.
Manifest: `output/imagegen/cel-calibration-v1/manifest.json`.
Prompt: `docs/art/cel-calibration-v1.prompt.txt`.
Actual reference input: `docs/references/user-anime-reference.png`.

One request submitted, one image delivered, no retry. Requested 16:9 / 4K;
actual received pixels are 1672 x 940. Preserve native pixels and do not describe
the output as native 4K.

## Observed Changes

- Grouped flat black hair replaces the fragmented glossy hair of the rejected image.
- Opaque skin and clearer cel shadow boundaries replace smooth illustrative shading.
- Compact lower faces and thicker expressive eyebrows move away from the prior elongated romance-comic facial construction.
- Higher scene exposure makes the drawing and gouache kitchen background inspectable.
- Ordinary seated poses replace the prior fashion-model composition.

## Still Provisional

- This is a style calibration, not an accepted character identity sheet.
- Both coat silhouettes are too similar for the user's final cast rules.
- Eye scale and adulthood cues need to be checked against the user's preferred balance of Akira-like realism and the supplied gothic anime reference.
- The output has been displayed for feedback. It has not been copied into public game assets or used to authorize further batching.
