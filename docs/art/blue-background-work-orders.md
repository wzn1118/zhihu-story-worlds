# Blue Blood Background Work Orders

ON HOLD: OpenQI returned terminal HTTP 402 on the Zhang Wei request. These
background jobs have not been submitted. Resume paid requests only after root
reports that the user has replenished the existing configured channel.

The planned next production batch replaces every reused station image in Blue
Blood with a location-specific background. Root integrates content and validates
the final UI. Workers own only their named prompt/output/review files; do not
edit shared scripts, content/worlds.ts, manifests or frontend files.

All jobs use the existing `generate-image2` and `openqi-imagegen` skills, explicit
`E:/CodexHome/openqi-imagegen.env`, actual image references, 16:9 requested 4K,
one paid submission per named job, no automatic resubmission after transport
errors. Preserve source pixels and actual dimension reports; do not upscale.
Image inspection is mandatory. Outputs: `output/imagegen/<job>/<job>-01.png`.

References: `docs/references/user-anime-reference.png` controls the exquisite
late-1990s gothic Japanese anime painted architecture/materials. The current
`output/imagegen/blue-training-room/blue-training-room-01.png` establishes the
shared city's daylight palette, practical late-1990s interiors and drawn detail.
Never introduce a character or face into a background. All characters are
separate transparent sprites. No baked lettering, panels, UI or posters. Quiet
right-center room for characters, readable medium values, intricate painted
materials, no globally dark overlay, no CGI, no modern neon or blurry gradients.

## Root: Office Interiors

- `blue-office`: daytime open-plan office in the same renovated commercial
  building as the training room. Boxy beige desktop computers, dark desks,
  paper files and tall iron-mullion windows; ordinary work, not a classroom.
  Used by desk and browser scenes; no readable on-screen text.
- `blue-restroom`: same building's clean old tiled washroom, mirror and sinks,
  no body reflections, blood, people or injuries. One subdued red package by
  the sink supports the observation scene without visualizing explicit detail.
- `blue-breakroom`: same office's small dusk kitchenette, kettle, two cups and
  a narrow window with pale evening light. Conversation space for Zhang Wei;
  foreground/right-center empty, no person painted in.

## story_backend: Street And Transit Backgrounds

Read `content/worlds.ts` Blue Blood nodes transit/alley/coordinate/station first.

- `blue-office-exterior`: 18:15 outside the renovated commercial building,
  glass revolving door, broad footpath, a route toward an old shopping street
  on the right and a clearly visible metro stair entrance on the left. Warm
  practical lamps, cool overcast dusk and restrained burgundy building details.
  No cars or silhouettes need to be shown. Spatially readable, not a station.
- `blue-old-street`: view toward a short blocked alley off a narrow old street
  at 19:00 dusk. A physical brick end wall is visible; no portal or magical beam.
  At the left edge a convenience-store window and door frame anchor continuity.
  Paving has restrained wet reflections of warm lamps, old stone and burgundy
  shop trim. Good sight lines, clear real wall and multiple layers of city depth.
  Serves alley/coordinate and the return ending's familiar street, not store
  interior. Do not bake street-name lettering into the image.
- `blue-metro-service`: 18:39, a modern-enough 1999 metro concourse built inside
  older iron/stone construction, ticket barriers and an empty glass service desk.
  Functional lights and timetable-like blank boards, legible routes, no train
  platform substituted for this service-counter scene. No people or silhouettes.

Inspect each result; accept only if it matches its scene and visual reference.
Write `docs/art/blue-city-review.md` with actual dimensions, output paths,
acceptance and material defects. Do not publish WebP or edit app files; root does
the reviewed encoding and integration. Do not proceed to unrelated images.

## game_frontend: Apartment And Store Backgrounds

Read `content/worlds.ts` Blue Blood nodes diner/home/forum/observer first.

- `blue-home`: 21:10 at Fang Nuo's small apartment, a normal tidy lived-in home
  with a desk lamp, blank notes, an old laptop/boxy monitor, a visible locked
  door, simple shelving and a window overlooking the same old city. Warm task
  light from image-left, cool night city, calm recognizable place. Two lighting
  layers with readable details; no full-scene darkness or generic bedroom.
- `blue-convenience-night`: 18:42 inside an ordinary corner convenience store,
  foreground window counter with one paper cup and small meal tray, stools and
  shelves of unlabelled grocery shapes. Through the large window, a short side
  alley and its end wall can be seen on image-right. Controlled twilight and
  amber store light. Same gothic-industrial city as the reference, practical
  shop interior, no fantasy pub or fancy cafe. No people.
- `blue-convenience-day`: use the accepted night store as the actual image
  reference and relight the SAME layout for 11:00 the next day. Preserve counter,
  cup, window, street geometry and alley wall. Clear overcast daylight, no new
  furniture. This hosts the conversation with the adult grey-jacket observer.

Generate the night store before the matching daytime variation. Inspect every
result. Write `docs/art/blue-domestic-review.md` with actual dimensions, output
paths, acceptance and material defects. Do not publish WebP or modify app files;
root does integration. These are original adaptation sets, not claimed original
novel illustrations. Do not proceed to unrelated images.
