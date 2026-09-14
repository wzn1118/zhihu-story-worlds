# Quick image launch / 2026-09-12

This lane owns the user's new request to shorten frontend image startup. The
recovery conversation retains the existing 40-image review and project/version
manifest verification. No original art queue, reviewed image, authored story, or
shared server on 4173/4174 is restarted by this lane.

Current bottleneck: POST project/art waits for all creative direction groups, and
the user then needs another click to dispatch. Add a durable asynchronous launch,
overlap completed direction groups with image work, preserve model settings and
paid job identities, and surface progress in an independent UI component.

New API: GET/POST /api/workshop/projects/:id/image-launch?version=rN. POST returns
202 with the stored launch state; retries reuse completed prompts and images.
Existing list and world GET routes remain read-only. Validation uses an isolated
server on 4176 and dedicated browser contexts. Pending work is not image delivery.

## Implementation

- `WorkshopQuickImages` displays one-click launch, per-project/version progress,
  returned/approved/rejected/native-4K counts, pause and resume. Initial state is
  loaded before the button is enabled. Old servers hide the new component until
  they advertise `capabilities.quickImages`, preventing unsupported requests.
- `workshop-image-launch` stores source-hashed launch receipts and a PID/token
  lease. A detached worker starts only after its parent publishes ownership.
  A closed tab does not cancel work. A dead owner is reported as interrupted.
- Direction uses the existing model and reasoning settings and emits validated
  groups. The first ready group goes to the existing independent image service
  while later groups are still being written. Completed prompts remain cached.
- Partial preparation preserves prior groups and source hashes. Image budgets,
  paid identities, uncertain results and provider circuit breakers remain in the
  existing service. An existing complete image batch skips direction and workers.
- Newly published text games use this asynchronous launch instead of waiting
  inside the text worker for all direction and image preparation.

## Validation

11 launch/queue tests pass: immediate dispatch contract, duplicate clicks, group
overlap, partial preparation, pause, failure/resume, dead ownership, and no repeat
paid attempts. 19 manifest/art binding tests also pass. TypeScript passes.

Production bundle built in `output/workshop-fast-build` using Vite with public
asset copying disabled; real original images remain served from `public` by the
existing live image route. The normal build's large public-art copy was stopped
after compiling; it is not claimed as a completed normal build.

Earlier browser run `2026-09-12T08-14-13-439Z` passed desktop/mobile display, reload
and real-image loading. It did not measure a fresh click. First-click timing in
`08-26-39-345Z` exceeded five seconds including browser action waiting, so it is
kept as failed evidence. The final run measures request-to-response explicitly.
No image approval or real paid-image identity was changed by this lane.

## Final frontend evidence

`output/playwright/quick-images/2026-09-12T08-44-22-030Z/verification.json`
passes at 1440×1000 and 390×844. A real frontend POST returned 202 in 3772 ms
(server timing: world read 5.1 ms, launch 3755.0 ms). This measures task
acknowledgement/reuse, **not** time to generate 40 new images. Both contexts
reloaded the page, recovered the same project/version progress, entered the game,
and decoded the actual 1672×940 opening PNG. Screenshots were retained; no browser
script errors and no new paid attempts occurred. The existing review snapshot
is 40 delivered, 27 approved, 13 rejected, zero native 4K, and remains distinct
from quick-launch acceptance.

Final launch receipts use atomic replacement without a separate forced disk sync
for each small progress file. The independent image service still uses fsync for
paid reservations and job state. Same-process duplicate starts share a promise;
cross-process starts retain the PID/token lease. This corrected a duplicate-start
test failure exposed while local filesystem operations were unusually slow.

Usable validation entry: http://127.0.0.1:4176, owned PID 59440 at final browser
validation. The shared recovery server remains owned by its conversation; this
lane has not stopped it or taken over the remaining art review/text generation.
The quick-images capability flag prevents an older server from displaying an
unsupported button before its next coordinated refresh. No commit was made.

## Validation server retired after integration

The integration owner requested consolidation after restoring the main server.
Verified 4176 was PID 59440, matching this lane's startup receipt and command.
Verified 4173 was PID 44780, health=ok, capabilities.quickImages=true. Closed only
PID 59440. Follow-up confirms 4176 has no listener, PID 59440 is absent, and
4173 remains PID 44780 with health=ok. The current user entry is now
http://127.0.0.1:4173; all screenshots and verification records remain available.

The accessible execution history in this conversation does not show a stop
command for 61824, 71296, 78860, 65440 or 70340, nor an explicit user instruction
to stop that group. This does not establish why those historical processes exited.
