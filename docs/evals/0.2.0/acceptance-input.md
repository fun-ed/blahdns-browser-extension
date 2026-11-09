# 0.2.0 acceptance input

Date: 2026-11-09. Requested changes: System/Light/Dark extension appearance, default BlahDNS Lite ABP at https://oooo.b-cdn.net/blahdns/lite_adblocker.txt, and unsigned Firefox XPI output.

## Expected evidence

- Native Bun format, repository syntax/policy lint, unit tests, build and package checks.
- Version-1 imports without theme remain valid; invalid themes and malformed or oversized default caches fail validation.
- The original ABP source is unchanged in bundled output and hashes match. The inspected source contains 114,578 accepted rules: 113,933 batched domains and 645 other supported network rules, with no unsupported input.
- Real Chrome, Brave and Firefox: preview/save Light and Dark; check popup uses the same saved preference; check System against native media preference. Emulate live OS preference changes in Chromium; Firefox BiDi media emulation is not used.
- Check save-button text contrast is at least 4.5:1 in both appearances and inspect screenshots.
- Click the default-source update button, verify URL/cache timestamp and active rule count. In Chromium, inject one default-cache storage failure and check old active rules and cached timestamp remain.
- Install the unmodified unsigned XPI in Firefox with optional proxy permission absent. Then run the existing complete fixture suite with optional proxy permission pre-granted only in the isolated test copy.
- Run the compiler benchmark and compare repeated ZIP/XPI builds for identical bytes.
- Verify exact source CI, publish a new 0.2.0 prerelease, download its three packages and SHA256SUMS, and compare all hashes. Preserve v0.1.0.

## Limits

No store signing, AMO submission, CRX key generation, minimum-version browser matrix, HTTPS-proxy transport matrix, QUIC guarantee or CAPTCHA acceptance claim. Current live DNS diagnostics were verified for 0.1.0; the diagnostic implementation is unchanged. No new DNS claim is inferred from these packaging/UI/list tests.
