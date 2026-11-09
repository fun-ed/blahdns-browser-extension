# Roadmap

## 0.2.3 prerelease gates

| Area                  | Evidence                                                                                           | Status                           |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| Native postconditions | Exact PAC read-back; failed privacy/proxy release rolls back settings and rules                    | Passed                           |
| Optional permission   | Unmodified Chrome/Brave first-install UI reports missing optional proxy access                     | Passed                           |
| Firefox wake          | First selected HTTP request wakes the stopped background after an isolated extension-process crash | Passed; natural idle not covered |
| Quality and packages  | 63 tests, 282 expectations; Chrome/Brave 22 checks each, Firefox 21 plus crash/wake                | Passed locally                   |
| GitHub publication    | Exact-source CI and downloaded package verification                                                | Pending                          |

See [0.2.3 acceptance output](evals/0.2.3/acceptance-output.md). Previous release tags and assets are preserved.

## 0.2.2 prerelease gates

| Area                 | Evidence                                                                                                                                           | Status                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Selector structure   | Quotes, brackets, parentheses, escapes and CSS newline controls; positive quoted/escaped cases; strict-CSP browser rendering                       | Passed                 |
| Enabled proxy status | Permanent getState applied=true assertions for HTTP and SOCKS5 in all three browsers; actual routed requests                                       | Passed                 |
| Quality and packages | 56 unit tests, 252 expectations; each browser 21 checks; source/archive integrity and repeat ZIP/XPI hashes                                        | Passed                 |
| GitHub publication   | [v0.2.2 prerelease](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.2.2); exact-source CI and downloaded ZIP/XPI hashes passed | Published and verified |

See [0.2.2 acceptance output](evals/0.2.2/acceptance-output.md). Earlier releases remain available below.

## 0.2.1 prerelease gates

| Area                 | Evidence                                                                                                                                                         | Status                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| CSS safety           | Comment delimiters rejected; valid later rules hide their target under strict CSP in all three browsers                                                          | Passed                 |
| Native status        | Repeated queries perform no native writes or listener changes; real Chromium write spies and native Firefox read-back                                            | Passed                 |
| Quality and packages | 46 unit tests, 232 expectations; Chrome/Brave/Firefox 19 checks each; archive/source checks and repeat ZIP/XPI hashes                                            | Passed                 |
| GitHub publication   | [v0.2.1 prerelease](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.2.1); exact-source CI and downloaded ZIP/XPI SHA-256 verification passed | Published and verified |

See [0.2.1 acceptance output](evals/0.2.1/acceptance-output.md). Earlier release tags, assets and evidence remain available below.

## 0.2.0 prerelease gates

| Area                     | Evidence                                                                                                                                                         | Status                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Appearance               | Saved Light/Dark in settings and popup; native System; screenshots and measured button contrast                                                                  | Passed                               |
| Default source           | Unchanged BlahDNS Lite ABP snapshot; manual update/cache in all browsers; rejected input and rollback checks                                                     | Passed                               |
| XPI                      | Byte-identical Firefox ZIP/XPI; real unmodified XPI installation without proxy permission                                                                        | Passed; unsigned development package |
| Quality and matrix       | 40 unit tests, 204 expectations; Chrome 17, Brave 17, Firefox 18; native lint/format/package checks                                                              | Passed                               |
| Reproducibility and cost | ZIP/XPI repeated-build SHA-256 match; versioned compiler-only benchmark                                                                                          | Passed                               |
| GitHub publication       | [v0.2.0 prerelease](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.2.0); exact-source CI and downloaded ZIP/XPI SHA-256 verification passed | Published and verified               |

See [0.2.0 acceptance output](evals/0.2.0/acceptance-output.md). Previous release evidence remains below; v0.1.0 artifacts and tag are preserved.

## 0.1.0 prerelease gates

| Area                 | Current evidence                                                                                                                                                        | Status                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Filtering and scopes | Hosts/ABP/CSS boundaries, domain trees, exceptions, URL cleanup, and actual browser requests                                                                            | Passed                                       |
| List handling        | Pinned upstream revisions, GPL notices, original input, omitted rules, and SHA-256 checks                                                                               | Passed                                       |
| UI and data          | Settings-page save, File import handler, serialized export, and real aggregate counters in all three browsers                                                           | Passed                                       |
| Native privacy       | WebRTC read-back in each browser and Firefox RFP read-back; no script fingerprint noise                                                                                 | Passed within the documented API scope       |
| Proxy                | All four types validated in unit tests; live HTTP and SOCKS5 routes in each browser                                                                                     | Passed within the tested matrix              |
| WebSocket            | Real handshake blocking in Chrome, Brave, and Firefox                                                                                                                   | Passed                                       |
| DNS                  | SG/DE RFC8484 POST diagnostics return NOERROR; setup is manual                                                                                                          | Passed                                       |
| Transport            | HTTP/2, HTTP/3, QUIC, and UDP limits documented against browser APIs                                                                                                    | Documented; transport negotiation not tested |
| Security             | Two medium findings corrected and reinspected; regression tests pass                                                                                                    | Passed for the reviewed paths                |
| Quality              | 36 unit tests, Bun lint, native format, package/hash checks, and compiler benchmark                                                                                     | Passed                                       |
| Browser packages     | Chrome 14 checks, Brave 14, Firefox 15; isolated profiles and package checksums                                                                                         | Passed                                       |
| GitHub release       | [v0.1.0 prerelease](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.1.0); downloaded ZIPs match local SHA-256; see `docs/evals/release-output.json` | Published and verified                       |

See [the acceptance output](evals/acceptance-output.md) for versions, commands, evidence, and limits. A passed local gate does not prove a store review, every minimum browser version, or every proxy transport.

## Next maintenance work

These items are separate from this GitHub prerelease. They need their own acceptance evidence before any claim is added:

- Submit store packages and obtain Firefox signing through the owner's store accounts.
- Extend the matrix to the declared minimum browser versions and native permission dialogs.
- Test authenticated HTTPS proxies, SOCKS4, WebRTC media, and HTTP/2/HTTP/3/QUIC behavior with controlled network fixtures.
- Measure specific browser-native fingerprint surfaces and site compatibility without collecting user browsing history. Do not add per-read random noise or promise CAPTCHA acceptance.
- Review list updates and their omitted syntax. Keep source revisions and evaluation records with each change.

## Collaboration

`CONTRACT.md` owns module interfaces. Keep parsers pure and browser adapters small. A change must update its affected callers, tests, and contract. Add a dependency or abstraction only for a measured need. Use the [development skill](../skills/extension-development/SKILL.md), [release skill](../skills/extension-release/SKILL.md), and [AGENTS gates](../AGENTS.md).
