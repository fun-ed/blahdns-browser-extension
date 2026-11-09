# Native postconditions and Firefox wake plan

Classification: core. Target: 0.2.3 patch. Continue the authorized fixes and GitHub prerelease.

## Scope

- `core/proxy.js`: compare actual PAC after set; inspect control after clear; distinguish missing optional permission from unsupported API.
- `background.js`: reject failed native release and retain existing rollback; register Firefox proxy listeners synchronously when the API is exposed.
- `ui/options.js`: render the returned unavailable-API explanation.
- Unit tests: acknowledged but ineffective native writes, release failure rollback, permission status and synchronous listener registration.
- Browser tests: unmodified Chromium first install and isolated Firefox crash recovery with the first selected HTTP request.

No permission, settings schema, runtime dependency, telemetry or browser fingerprint policy changes. CSS parser behavior stays unchanged; the bounded 80-case lexical review found no new defect and does not establish full grammar coverage.

## Verification

Run all AGENTS gates through mise. The Firefox wake fixture temporarily grants proxy access, adds a script-free observation view and restricts both listener filters to its reserved hostname to avoid unrelated browser wake events. Assert the background is stopped before requesting that hostname, then require the local proxy response and restarted background. Record forced crash recovery separately from untested natural idle shutdown.

Preserve earlier release tags and package bytes. Compare repeat ZIP/XPI hashes, exact-source CI and downloaded release assets. Store signing, native permission dialogs, minimum browser versions and transport negotiation remain outside this patch.
