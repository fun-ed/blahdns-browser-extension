# Verification run 001

Date: 2026-11-09. Working tree: 0.2.0 changes on top of `b745108`.

Command: frozen-lockfile install, native format, format check, repository lint, unit tests, build, package checks, browser matrix and benchmark, chained to stop on the first failure.

Install, formatting and lint passed. Unit tests reported 35 pass, 3 fail, 172 expectations; later commands did not run. The failing cases were invalid-stored-settings recovery, sender-scoped CSS, and subscription redirect rollback. The storage fixture only implemented a single string key, while the new startup correctly uses the browser API's array-of-keys form for settings and default-list cache. This made the fixture omit stored settings.

Correction: implement array key retrieval in the fixture, preserve single-string retrieval, and add default-list success/storage-rollback and rejected-download tests. No pass is inferred from this failed run. The next gate output supersedes it only after execution.
