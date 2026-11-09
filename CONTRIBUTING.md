# Contributing

This repository is in prerelease development. Read [AGENTS.md](AGENTS.md), [CONTRACT.md](CONTRACT.md), and [plan.md](plan.md) before changing behavior. Keep changes within the owned interface and update directly affected documentation when behavior changes.

## Development setup

Use the mise-pinned Bun 1.4.4. `bun fmt --check` is Bun's built-in formatter; `bun lint` is the repository's own check. Run every project command through mise, including local checks and CI jobs:

```sh
mise exec -- bun install
```

Write UI labels, comments, and docs in plain English. Keep permissions narrow and explained. Treat bundled, custom, and subscribed filter lists as untrusted text. Unsupported syntax must remain visible in diagnostics. Do not add remote code, telemetry, or persistent browsing history.

## Before submitting a change

Review the diff for its scope, callers, settings/message contracts, privacy effects, permission changes, and documentation impact. Then run the relevant checks through mise:

```sh
mise exec -- bun fmt --check
mise exec -- bun lint
mise exec -- bun test
mise exec -- bun run build
mise exec -- bun run check
mise exec -- bun run test:browser
mise exec -- bun run benchmark
```

A release candidate also needs real integration checks in Chrome, Brave, and Firefox. Check the generated manifests, installation behavior, and each artifact's source revision and SHA-256 checksum. Report checks as pending until they are run. If a browser, runtime, or service is unavailable, record that gate as blocked with the reason; do not imply it passed.

## Lists and research notes

Review the license and source revision before updating bundled list snapshots. Keep generated provenance and hashes with the list artifacts. Update `docs/evals/research-input.md` and `docs/evals/research-output.md` when research changes; retain structured facts, decisions, and limitations rather than transcripts.

## Release boundary

GitHub prereleases are for manual installation and testing. Firefox requires a signed XPI for permanent installation; this prerelease uses temporary add-on loading. Follow [the release skill](skills/extension-release/SKILL.md) for manifest/hash gates and installation steps. A store upload or public release requires explicit authorization.
