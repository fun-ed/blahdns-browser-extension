# 0.2.1 acceptance input

Scope: fix CSS comment poisoning and make getState native status queries read-only. Publish only after exact-source CI and downloaded-artifact verification.

## Regressions

- Input `##.x/*`, `##.x*/`, then `##.advert`: reject both comment delimiters, retain the valid selector, and hide its target in real browsers under the fixture CSP.
- Repeated getState calls after initialization must perform no native set/clear, storage writes, DNR updates or proxy listener registration. Read failures must leave the settings response reachable with per-section error status.
- readPrivacy/readProxy must report actual values, mismatch and control priority. Chromium PAC read-back must match the desired PAC. Apply paths must retain masked-setting clear behavior and no-direct-fallback proxy behavior.
- In Chrome/Brave, replace native set/clear methods with rejecting spies after initialization, call getState and verify zero calls. Firefox retains native privacy/RFP/proxy read-back plus deterministic unit coverage of query side effects.

## Gates

Run mise-managed Bun frozen-lockfile install, native format, repository lint, unit tests, build, archive/source checks, real Chrome/Brave/Firefox matrix, compiler benchmark and repeat-build comparison. Preserve 0.2.0 evidence and all earlier tags/assets. Produce Chromium ZIP, Firefox ZIP, unsigned XPI and SHA256SUMS. Verify source commit CI before publishing and compare downloaded package bytes, GitHub digests where available, and checksum text afterward.

## Limits

Comment rejection is a bounded CSS safety check, not a complete CSS grammar parser. Native writes remain allowed on background initialization, explicit saves, rollback and permission lifecycle; a status handler itself must not write or repair mismatches. Store signing, CRX, minimum browser versions, CAPTCHA outcomes and complete proxy transport coverage are outside this patch.
