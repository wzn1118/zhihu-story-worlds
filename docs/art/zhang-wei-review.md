# Zhang Wei Production Review

Status: **blocked by provider credit balance; no image produced**.

## Current Request

- Character: original adult Zhang Wei, 28, colleague in the game adaptation of
  source story `2025684191967294692`.
- Main prompt: `docs/art/zhang-wei-main.prompt.txt`.
- Output directory: `output/imagegen/zhang-wei-main/`.
- Generation manifest: `output/imagegen/zhang-wei-main/manifest.json`.
- Configured channel/model: existing private OpenQI channel, `gpt-image-2`.
- Requested ratio/resolution: portrait 3:4, 4K.
- Request count in this pass: 1; no retry or fallback request.
- Provider result: **HTTP 402: insufficient credits**.
- Delivered images: 0. Actual image dimensions: not applicable.
- In-flight requests: 0. Reaction and targeted correction were not submitted.

The request reached a terminal error. The bundled client preserved the failure
manifest and private recovery record. There is no delivered image to inspect,
accept, publish, or use as a reaction reference. A future authorized submission
requires the provider balance to be available; this worker did not repeat the
paid POST or switch credential channels.

## Prepared Drawing Contract

The prompt uses the user's current full-character and face reference images as
actual inputs. It also uses
`output/imagegen/fang-nuo-face-shadow-v3/fang-nuo-face-shadow-v3-01.png`
for cel rendering and connected cheek-shadow structure only, not identity.

Fixed Zhang Wei differences from Fang Nuo:

- Higher and broader forehead.
- Chestnut-black inward-bending chin-length bob with a broad right-side part.
- Gently arched tapered eyebrows and more widely spaced narrow horizontal eyes.
- A distinctly shorter straight nose with a clear compact base.
- Broader cheekbones and a soft broad pentagonal jaw with a compact blunt chin.
- Black asymmetric wrap jacket over wine-red knit, small square old-silver studs,
  and one practical scarlet pen clip.

Main staging: knee-up standing sprite, both hands holding a plain ceramic mug at
the waist, attentive support with slight tension, complete head/elbows/hands/mug,
uniform pale neutral backdrop. Strong connected hard-edged cheek shadow is a
primary requirement. Reaction must retain the actual main's face, geometry,
clothes, hands, mug, framing and light, changing only restrained expression after
main passes visual review.

## Acceptance And Scope

- Accepted candidates: none; no visual-quality conclusion can be drawn without
  an output image.
- No files in shared types, content, src, public or the global ledger were
  modified.
- Credentials and signed URLs are absent from the prompt and this review.
- Production prompts and failed-request evidence are preserved for root handoff.
