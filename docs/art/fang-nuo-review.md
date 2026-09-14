# Fang Nuo Main / Reaction Review

Status: held after main and one targeted relighting edit. No approved delivery;
reaction was not submitted because the face-shadow requirement still fails.

The current task uses the user's latest two character references and V5 only as
a drawing/lighting study. None of those reference people is asserted to be Fang
Nuo. Fang Nuo is the original 27-year-old adult woman defined for the game
adaptation of story `2025684191967294692`.

## Main V1

- Original: `output/imagegen/fang-nuo-main/fang-nuo-main-01.png`.
- Actual pixels: 1086 x 1448, exact 3:4, 1,174,550 bytes.
- Requested 4K was not fulfilled. No enlargement was performed.
- SHA-256: `db63ee4476296dd073dd02afd8bae037ab07f9afd2c449fa88421457173cd9c1`.
- Inspected with `view_image`. Drawing, narrow eyes, matte lips, grouped short
  hair and black/grey/deep-red clothing are closer to the latest user references.
- Not accepted for facial lighting: the broad near cheek is largely fully lit;
  shadow remains mostly under the fringe, beside the nose and on the neck. The
  requested connected 35-45 percent face shadow is missing.
- Head, elbows and both hands are inside the canvas. Background border samples
  are near-neutral RGB 234-235 rather than the requested uniform 242. There is no
  cast shadow onto the background; the mild background variation is retained.
- Actual hand continuity: the notebook is held in the figure's RIGHT hand on
  image-left; the silver watch is on the figure's LEFT wrist on image-right.
  This reverses the prompt's handedness. All future reactions must follow the
  actual image, not silently mirror the props back.
- The chin is still a little tapered/rounded compared with the provisional
  short squared-chin anchor. Do not claim exact identity-anchor compliance.

## Targeted Relighting

Root explicitly directed one local relighting edit before a conditional reaction.
`fang-nuo-main-light-v2` was submitted once with main V1 as the pixel/identity
reference and V5 as the light-only reference. It completed and was inspected
with `view_image`.
This is a requested edit, not a retry of a failed or unknown paid submission.

The edit must connect an opaque hard-edged side-plane shadow from the
image-right temple/eye socket through the near cheek to the jaw while preserving
all pose, identity, clothing, props and background geometry.

### Main Light V2 Result

- Original: `output/imagegen/fang-nuo-main-light-v2/fang-nuo-main-light-v2-01.png`.
- Actual native pixels: 3072 x 4096, exact 3:4, 5,665,036 bytes. The service's 4K
  request is fulfilled in this edit; no local enlargement was performed.
- SHA-256: `3c2828acdad5d9626f9feea88bb1ec67b8d289b494c34ad7a98c9b417860efc1`.
- Identity and main pose are visually retained: short asymmetrical black hair,
  narrow dark eyes, long straight nose, matte mouth, charcoal offset-zip jacket,
  wine-red inner panel, image-left notebook and image-right silver watch.
- The new shadow is stronger around the IMAGE-LEFT fringe-side eye, nose/lip
  edge and part of the chin. The large IMAGE-RIGHT near-cheek plane remains lit.
  This is the wrong side/coverage for the requested temple-to-near-cheek-to-jaw
  shadow and does not demonstrate the requested 35-40 percent connected face
  plane. Face skin is also warmer/darker overall, which does not substitute for
  the missing structural shadow.
- Head, clothes, pose and accessories are visually consistent. This is not
  literal pixel preservation because the provider returned a different native
  resolution and regenerated fine line details.
- The image remains a calibration candidate, not accepted main art. No reaction
  should inherit its lighting until root decides the next correction.

## Current Identity Anchors And Limits

- Retained in both candidates: compact asymmetric short-black-hair silhouette,
  medium forehead, near-straight eyebrows, narrow eyes with visible sclera,
  medium-long straight nose, charcoal offset zipper with wine-red lining, and a
  thin silver wristwatch.
- The chin remains more rounded/tapered than the provisional short square chin.
  Hair has a few more decorative highlight streaks than the restrained reference.
- Actual prop handedness is mirrored relative to the main prompt and is recorded
  above. Keep that actual arrangement in any future reaction.
- Facial-shadow placement/coverage is the primary blocker. These notes are an
  agent review and do not imply user approval.

## Generation Safety

- Paid requests so far in this task: 2, both each submitted once.
- Both requests completed with verified archive and delivery; cleanup status
  `deleted` for each.
- Current in-flight requests: none.
- Reaction has not been submitted because the edited main failed the visual
  lighting check. No additional paid request was made.
- Receipts and recovery data remain under each task output's ignored `archive/`
  directory. No credentials or signed URLs are in these review notes.
- No files in `src`, `shared`, `content`, `public` or the main progress log have
  been changed by this art worker.
