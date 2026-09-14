# Recorded regression inputs

`zhihu-story-excerpts.json` contains the 20 existing story API excerpt records used by
the authored worlds. The title, author, story ID, 3,000-character excerpt, retrieval
timestamp and content SHA-256 come from the project's recorded API cache. No account,
credential or browser state is included. These are recorded responses, not live API checks.

The attribution and exact-quote tests use these committed records so they run in a
clean checkout without `.local/zhihu-cache`. Existing compressed world snapshots
remain the baselines for branch, prose and save-migration regression tests.
