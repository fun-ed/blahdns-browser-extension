# CSS comments and read-only native status

Target: 0.2.1 patch release. Classification: core. User authorized fixes and publication.

## Scope

- Reject CSS comment delimiters in cosmetic selectors. Reproduce `##.x/*` followed by `##.advert`: the invalid comment must be diagnosed while the valid rule still hides its target.
- Add readPrivacy/readProxy status entrypoints. They inspect actual values and control priority without set, clear, listener registration or repair. getState uses these reads; startup, saves, permission lifecycle and rollback keep their existing apply paths.
- Preserve public status response shapes, settings version 1, native-setting release semantics, proxy no-direct-fallback behavior, existing list source and telemetry opt-outs. Add no dependency or permission.
- Publish a new patch prerelease; preserve v0.1.0 and v0.2.0 tags and assets.

## Files

Parser and core tests; privacy/proxy modules and network tests; background imports/state and background regression tests; browser harness; package version, contract, README, changelog, roadmap and versioned evaluation records.

## Verification

Unit tests reject CSS comments and assert repeated getState/read calls perform no writes or listener changes, including native mismatches and read errors. Real Chrome/Brave/Firefox fixtures put the malformed rule before a valid one and verify actual hiding under strict CSP. Retain existing native privacy and scoped proxy read-back checks. Run formatting, lint, unit tests, ZIP/XPI build/integrity checks, browser matrix, compiler benchmark and repeat-build hash comparison through mise-managed Bun. Require exact-source CI before publication and independently download all packages and checksum file after upload.

## Limits and recovery

No full CSS grammar implementation, store signing, CRX generation, new browser spoofing or protocol guarantees. Unsupported comments are reported rather than executed. Native status reads may report mismatches; users must save settings to reapply them. Existing save rollback remains the recovery path.
