# 0.2.3 acceptance output

## Verified local gates

| Gate                            | Result | Evidence                                                                                                                                                                                                                                           |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format and lint                 | Passed | Bun native format; repository syntax/import/CSP/package policy checks, 23 source files                                                                                                                                                             |
| Unit tests                      | Passed | 63 tests, 282 expectations; contradictory PAC read-back, ineffective native clear rollback, optional permission status and synchronous startup registration                                                                                        |
| Browser matrix                  | Passed | [Browser output](browser-output.json): Chrome 157.0.8103.39 and Brave Beta on Chromium 157.0.8103.39 each pass 22 checks; Firefox Developer Edition 160 passes 21                                                                                  |
| First install                   | Passed | Unmodified Chrome/Brave without proxy permission display permission guidance; unmodified unsigned Firefox XPI loads without proxy access                                                                                                           |
| Firefox crash/wake              | Passed | [Before](firefox-wake-before.json): 0.2.2 background stays stopped and first request fails. [After](firefox-wake-output.json): 0.2.3 observes a stopped background, routes the first selected request through the local proxy and confirms restart |
| Existing behavior               | Passed | CSS hiding under strict CSP, WebSockets, links, native privacy, scopes, settings round-trip, themes, counters, default-list cache and HTTP/SOCKS5 routing                                                                                          |
| Packages                        | Passed | [Build](build-output.json); source hashes, manifests and archives match. [Repeat builds](reproducible-output.json) have identical SHA-256; Firefox ZIP/XPI are byte-identical                                                                      |
| Compiler benchmark              | Passed | [Benchmark](benchmark-output.json): one warm-up and 20 compiler-only iterations; no browser/network or language comparison                                                                                                                         |
| Exact-source CI and publication | Passed | [CI](ci-output.json), [release input](release-input.json) and [release output](release-output.json): source/tag `687bd854c5bf8d913aa4f05114121009c0e6fa2b` matches; all four downloaded assets match local bytes, SHA-256 and GitHub digests       |

## Boundaries

The wake test uses a disposable profile, test-only proxy grant, script-free observation view and listener filters restricted to the reserved fixture hostname to prevent unrelated requests from waking it early. The release uses `<all_urls>`. This verifies forced extension-process crash recovery, not natural idle shutdown or native permission prompts. `about:crashextensions` can abort its own navigation; the stopped-background assertion establishes the test precondition.

Native acknowledged-but-ineffective writes are injected tests, not a claim that real browsers ordinarily violate their API. Failed release preserves stored settings and rules through the existing rollback path. No new runtime dependency, permission, telemetry or settings schema is introduced.

A bounded 80-case lexical CSS review found no new defect in the existing parser. It does not prove full CSS grammar coverage. Minimum browser versions, all proxy transports, WebRTC media, HTTP/2/HTTP/3/QUIC, store signing, CRX and CAPTCHA outcomes remain untested. XPI is unsigned and supports temporary development loading; ordinary permanent Firefox installation requires Mozilla signing.

## Publication

The public [v0.2.3 prerelease](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.2.3) contains Chromium ZIP, Firefox ZIP, unsigned Firefox XPI and SHA256SUMS. The exact-source GitHub Actions run passed, including the Chrome integration gate. Local testing additionally covers Brave and Firefox crash recovery. Previous release tag targets remain unchanged. Publication evidence is committed after the immutable source tag.
