# Packaged art direction

These three books are the existing 20-world authoring records, copied byte-for-byte
from the project's owner books on 2026-09-14. They contain source-bound scene beats,
cast identities, prompts and source hashes, not image approval receipts or credentials.

`readArtSourceBook` prefers a local owner revision under
`output/imagegen/scene-production/art-team/<owner>/short-production-20260907/book.json`.
When that file is absent, it reads the packaged book. Invalid local JSON fails instead
of silently using an older record. The existing story/source-hash checks still reject
stale scene directions.
