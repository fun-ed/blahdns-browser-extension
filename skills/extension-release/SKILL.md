---
name: extension-release
description: Use when packaging, verifying or publishing this extension's prerelease.
---

# Extension release

1. Read `AGENTS.md`, `CONTRACT.md`, `CHANGELOG.md` and `PRIVACY.md`. Confirm source revisions, licenses, browser support and known limits against the checkout.
2. Run all behavior-change gates in `AGENTS.md`. Require real Chrome, Brave and Firefox integration, including themes, manual list updates, the unmodified unsigned XPI and Firefox crash/wake coverage.
3. Review generated manifests and permissions. Verify source revision, repeat-build SHA-256, and byte-identical Firefox ZIP/XPI. Update the changelog and current evidence with actual results; mark unavailable gates blocked.
4. With user authorization, publish a clearly labeled prerelease to `fun-ed/blahdns-browser-extension`. Preserve previous tags and asset bytes. Verify exact-source CI, tag target and independently downloaded assets against local bytes, checksums and GitHub digests.
5. Use the installation steps in `README.md`. Ordinary permanent Firefox installation requires Mozilla signing. Store submission and CRX signing need a separate authorized release path.

Keep claims within the tested scope: DoH setup is manual, proxy scope follows destination hosts, privacy controls can be browser-wide, and transport negotiation remains browser-controlled. No fingerprint anonymity or CAPTCHA guarantee.
