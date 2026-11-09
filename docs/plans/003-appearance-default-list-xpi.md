# Appearance, default list, and XPI plan

Date: 2026-11-09. Classification: core. Target: 0.2.0 prerelease.

## Requested behavior

- Provide System, Light, and Dark appearances for settings and popup. Default to System; preserve old settings imports and apply changes only to extension UI.
- Replace the bundled ad list with https://oooo.b-cdn.net/blahdns/lite_adblocker.txt. Preserve original ABP syntax and record input bytes, hashes, retrieval time, parser counts, and source notices. Keep the separate content-farm control.
- Include an offline snapshot. Add an explicit update button with no scheduled or startup network requests. Cache a successful update locally. Validate downloaded content and roll back a failed rules/storage transaction.
- Produce unsigned Firefox XPI in addition to existing Chromium and Firefox ZIPs. XPI and Firefox ZIP must be byte-identical. Explain Mozilla signing and CRX distribution limits.
- Publish a new prerelease and preserve v0.1.0 artifacts and tag.

## Boundaries

No new dependency, permission, remote code, telemetry, browser-profile change, fingerprint spoofing, AMO submission, signing-key generation, or store submission. Existing custom subscription limits stay unchanged. The fixed default-list download has a separate 4 MB bound because the inspected source is about 2.9 MB.

## Interfaces and files

- `core/settings.js`: optional version-1 `theme`, validated to system/light/dark; missing means system. Export the fixed default-list URL.
- `background.js`: bounded fixed-source downloads, validated local default-list cache, `defaultList` status, and privileged `updateDefaultList` message. Reuse the current save transaction with an optional prospective cache so rollback compiles the old source.
- `ui/`: shared theme application, light tokens, Appearance selection, source status and explicit update button.
- `tools/update-lists.js`: preserve the requested ABP snapshot; content-address the mutable CDN URL and retain the pinned farm source.
- `tools/build.js`, `tools/check.js`, CI: XPI output, checksums, byte-equality check and artifact coverage.
- `tests/` and browser harness: old-import compatibility, invalid theme rejection, live/saved themes in options and popup, OS changes, default-source updates, and an actual unsigned-XPI Firefox install.
- README, PRIVACY, NOTICE, CHANGELOG, CONTRACT, roadmap and versioned evaluation records: source, privacy behavior, installation limits and exact verification.

## Verification

Run native formatting, repository lint, unit tests, build, package checks, real Chrome/Brave/Firefox checks and the compiler benchmark through mise-managed Bun. Inspect light and dark screenshots. Verify reproducible archives. Verify CI for the exact source commit, then tag and publish ZIP/XPI/SHA256SUMS and download them to compare SHA-256. Keep new evidence under `docs/evals/0.2.0/` and retain existing 0.1.0 records.

## Recovery and limits

A failed default-list update must retain active rules and the previous cache. The existing adblock switch controls this default source. Blocking can still break a site; domain exceptions remain available. Unsigned XPI is a development package; ordinary Firefox permanent installation requires Mozilla signing. No claim of CAPTCHA avoidance or browser-store approval is added.
