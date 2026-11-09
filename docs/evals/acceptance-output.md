# Acceptance output

Date: 2026-11-09. Release candidate: 0.1.0. Runtime source is dependency-free JavaScript. Development uses mise-managed Bun 1.4.4. The only direct development dependency is puppeteer-core 25.16.0. No ESLint, Prettier, or other lint package is installed.

## Local gates

| Gate                             | Result                  | Evidence                                                                                                                                                                 |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bun syntax and repository policy | Passed                  | `mise exec -- bun lint`: 21 source files; checks syntax, local imports, browser boundaries, CSP markup, and package policy. It is not a full style or type linter.       |
| Unit tests                       | Passed                  | `mise exec -- bun test`: 36 tests, 166 expectations, no failures.                                                                                                        |
| Native formatting                | Passed after formatting | `mise exec -- bun fmt`; run `mise exec -- bun fmt --check` before commit.                                                                                                |
| Chromium and Firefox build       | Passed                  | `mise exec -- bun run build`; see [build output](build-output.json).                                                                                                     |
| Package and list hashes          | Passed                  | `mise exec -- bun run check`: ZIP integrity, source/output hashes, manifests, permissions, and licenses match.                                                           |
| Real browser integration         | Passed                  | `mise exec -- bun run test:browser`; [structured output](browser-output.json).                                                                                           |
| Compiler benchmark               | Passed                  | `mise exec -- bun run benchmark`; [input](benchmark-input.md) and [output](benchmark-output.json). This does not compare languages or measure browser request latency.   |
| Live DNS diagnostics             | Passed                  | Fixed example.com A queries return NOERROR from both SG and DE; [output](dns-output.json). These were run under Bun and do not prove the browser resolver configuration. |
| Security review                  | Findings corrected      | [Input](security-input.md) and [output](security-output.md). Source reinspection found no remaining high/medium issues in the two corrected paths.                       |

## Browser matrix

Tests use new, empty profiles. They do not use a signed-in browser profile.

| Executable family         | Reported version       | Result           |
| ------------------------- | ---------------------- | ---------------- |
| Google Chrome             | Chrome/157.0.8103.39   | 14 checks passed |
| Brave Browser Beta        | Chromium 157.0.8103.39 | 14 checks passed |
| Firefox Developer Edition | firefox/160.0          | 15 checks passed |

Each browser test checks default rule installation, settings-page save, File import handling, serialized export content, cosmetic filtering under a strict CSP, clean links, HTTP request blocking, WebSocket handshake blocking, aggregate counters without history, navigation redirects, signed-URL exemptions, User-Agent and language request headers, WebRTC read-back, wildcard exceptions, selected-site mode, invalid-setting preservation, HTTP proxy routing, SOCKS5 routing with a remote destination name, and settings-page reopening. Firefox also checks native resistFingerprinting read-back. Some related checks are grouped into one matrix count.

## Test harness boundaries

- The test copy pre-grants the optional proxy API. The release package keeps it optional. Native permission dialogs are not automated.
- Firefox's temporary test child sets `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` so BiDi can access the extension page. This flag is not in the extension or the user's browser configuration. Firefox filters extension lifecycle events; the harness waits for the direct BiDi navigation command to finish.
- Firefox BiDi rejects `input.setFiles` in extension contexts. The harness supplies a standard File/DataTransfer object and dispatches the same input event. It tests the real import handler, not the operating-system file picker.
- Export tests capture the Blob produced by the real UI and prevent the download click. They do not write into the user's Downloads folder or test an operating-system download dialog.
- Browser tests use local HTTP and SOCKS5 fixtures. HTTPS proxy TLS, SOCKS4 end-to-end traffic, proxy authentication, live HTTP/2 or HTTP/3 negotiation, QUIC, WebRTC media traffic, and CAPTCHA outcomes are not tested.
- Browser-native fingerprint policy is read back. Individual canvas, audio, WebGL, timezone, worker, and Client Hints behavior is not independently certified. The extension does not promise complete fingerprint coverage.
- Minimum versions in the manifests are Chrome 121 and Firefox 140. Those older builds are not part of this runtime matrix.
- Popup parent-domain exception logic was inspected. Toolbar popup interaction is not part of the automated matrix.

## Failure history

Earlier structured runs are retained as `browser-run-*.json`. They record the Chromium RE2 limit, Firefox BiDi restrictions, the Firefox content-script iterator failure, and the WebSocket handshake URL difference. Run 008 used an extra fixture rule to confirm the handshake hypothesis. The compiler now supplies the alias and the final suite uses the original WebSocket rule. A test-run timeout was followed by bounded protocol/cleanup timeouts; it is not counted as a pass. The final browser output supersedes earlier failed results.

## Publication

Local source and package gates are complete. GitHub publication and downloaded-asset read-back are recorded separately in `release-output.json` after they occur. A GitHub prerelease is not a browser-store signature or listing.
