# 0.2.2 acceptance output

## Verified local gates

| Gate                      | Result | Evidence                                                                                                                                                                                                                                      |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lock, format and lint     | Passed | Frozen install: 25 packages unchanged. Native Bun formatting and repository lint pass for 22 source files; lint is syntax/import/CSP/package-policy validation.                                                                               |
| Unit tests                | Passed | 56 tests, 252 expectations, no failures. Each unclosed/mismatched quote/bracket/parenthesis, terminal escape and CSS newline case is rejected; balanced quoted and escaped tokens remain accepted.                                            |
| Browser matrix            | Passed | [Browser output](browser-output.json): isolated Chrome 157.0.8103.39, Brave Beta on Chromium 157.0.8103.39, and Firefox Developer Edition 160 each pass 21 checks.                                                                            |
| CSS rendering             | Passed | Every malformed selector precedes a valid hide rule in the strict-CSP fixture. Rejected-rule count matches all malformed inputs, and the valid element is actually hidden in all three browsers.                                              |
| Enabled proxy status      | Passed | Permanent assertions call getState after enabling HTTP and SOCKS5, require proxy.enabled and proxyStatus.applied=true, then verify actual routed requests. Exact PAC comparison remains unchanged.                                            |
| Existing privacy behavior | Passed | Native WebRTC/RFP, no-write getState spies, proxy no-direct-fallback, settings round-trip, themes, URL cleaning and WebSocket checks remain passing.                                                                                          |
| Build and integrity       | Passed | [Build output](build-output.json); ZIP/XPI integrity, source hashes and manifests pass. Unmodified unsigned XPI installation passes in Firefox without proxy permission.                                                                      |
| Repeat builds             | Passed | [Repeat output](reproducible-output.json): identical local byte lengths and SHA-256 across builds; Firefox ZIP/XPI are byte-identical.                                                                                                        |
| Compiler benchmark        | Passed | [Benchmark](benchmark-output.json): warm-up plus 20 timed compiler-only iterations; no browser latency or cross-language comparison claim.                                                                                                    |
| Source CI and publication | Passed | [Exact-source CI](ci-output.json), [release input](release-input.json) and [release output](release-output.json). Source/tag `3d07215e79513257f77fbca3eef788d2dfb890ae` matches; downloaded packages and checksum text match local artifacts. |

## Regression history

Before the structural fix, `mise exec -- bun test tests/core.test.js` reported 15 pass, 8 fail and 82 expectations. Each original malformed selector was accepted instead of rejected. A bounded quote/escape/delimiter stack now rejects those inputs; a CSS form-feed case and positive escaped/quoted cases are also covered. The final green run supersedes the red run; previous release evidence is preserved.

## Limits

This validates token structure within the existing cosmetic subset, not complete CSS grammar. Browser-specific unsupported selectors can still be ignored by the browser. No new dependency, permission, native-setting policy or settings schema is added. Tests cover the listed browser versions and pre-grant proxy permission only in an isolated test copy. Native optional permission dialogs, minimum browser versions, store signing, CRX, full proxy transports and CAPTCHA outcomes are not claimed. XPI remains unsigned and supports temporary loading; permanent ordinary Firefox installation requires Mozilla signing.

## Publication

The public [v0.2.2 prerelease](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.2.2) contains Chromium ZIP, Firefox ZIP, unsigned Firefox XPI and SHA256SUMS. Package downloads were independently checked against local bytes/SHA-256, and reported GitHub digests were compared. Previous v0.1.0, v0.2.0 and v0.2.1 tag targets remain unchanged. Publication evidence is committed after the immutable release source tag.
