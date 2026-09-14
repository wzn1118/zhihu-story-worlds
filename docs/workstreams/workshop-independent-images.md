# Workshop image execution — 2026-09-12

The current user explicitly requests 40 real illustrations through the configured
OpenQI image relay, with a separate workshop execution channel. This supersedes
the historical instruction to share the formal-art queue. No formal-art queue,
worker, state, credentials, or paid identities are modified by this work.

Implementation in progress: `server/workshop-images.ts` and its dedicated worker
own `output/workshop-images/.private`; public files use `/generated-art/workshop/`.
The configured private client reports `https://img.openqi.sbs/v1`, `gpt-image-2`.
Requests explicitly ask for 16:9, 4K. Report actual decoded dimensions separately.
Sharing a provider account still shares that provider's quota; this implementation
isolates local workers, reservations, queue files, run budgets, and recovery.

## API

- POST `/api/workshop/projects/:id/art`: prepare isolated, idempotent scene jobs.
- GET `/api/workshop/images/:id`: durable state, counts, and sanitized job records.
- POST `/api/workshop/images/:id/run`: maxJobs 1–40, concurrency 1–8; defaults 40/8.
- POST `/api/workshop/images/:id/pause`: pause queued work; retain active requests.
- POST `/api/workshop/images/:id/jobs/:jobId/review`: actual image review.

IDs begin `wart_` and `wscene_`. Existing `/api/art` defaults remain 2/2 and
continue serving other work. A frontend button now targets the independent API.
Newly published text games prepare and start this isolated image work automatically.
Game reads never submit generation requests. Rejected, stale, missing, or corrupt
assets must be excluded on the next read without modifying cached worlds.

## Delivery target and evidence

Reuse actual creative-stage sample `import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10`,
published r1: 40 scenes, 3 routes, 7 resolved endings / 4 Bad Ends. This is an
original example and never a Zhihu excerpt. Source bytes and saves stay intact.
The later Tide Station run has not published; its saved route checkpoints remain.

No newly generated images are counted yet. This report will be updated from real
frontend dispatch, worker receipts, file decoding/hashes, and inspected screenshots.
Only the owned isolated server on 4174 may be refreshed; 4173 is left running.
