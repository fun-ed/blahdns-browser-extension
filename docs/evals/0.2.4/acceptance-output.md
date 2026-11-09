# 0.2.4 verification

This maintenance release removes superseded documentation and two CSS design-note comments. Filtering, settings, permissions and privacy behavior are unchanged.

| Gate                            | Result | Evidence                                                                                                                                                                                                                  |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies, format and lint   | Passed | Frozen install unchanged; Bun formatting and repository checks for 23 source files                                                                                                                                        |
| Unit tests                      | Passed | 63 tests, 282 expectations                                                                                                                                                                                                |
| Browser matrix                  | Passed | [Results](browser-output.json): Chrome 157.0.8103.39 and Brave Beta on Chromium 157 each pass 22 checks; Firefox Developer Edition 160 passes 21                                                                          |
| Firefox wake                    | Passed | [Current test](firefox-wake-output.json): background stopped before the selected request, then restarted with a successful local-proxy response                                                                           |
| Packages                        | Passed | [Build](build-output.json) and [repeat-build comparison](reproducible-output.json); archive/source checks and byte-identical Firefox ZIP/XPI                                                                              |
| Compiler benchmark              | Passed | [Results](benchmark-output.json): warm-up plus 20 compiler-only iterations                                                                                                                                                |
| Exact-source CI and publication | Passed | [CI](ci-output.json) and [release](release-output.json): source/tag `c9746773b23fec9d0fd5669cc2aa4a3baffca640` matches; four downloaded assets match local bytes, SHA-256 and GitHub digests; previous tags are unchanged |

The retained [0.2.2/0.2.3 comparison](firefox-wake-filter-comparison.json) documents the earlier proxy wake fix. See the [test method](../../research-firefox-proxy-event-page.md) for isolation and filter details.

Limits remain: unsigned temporary Firefox loading, untested minimum browser versions and native permission dialogs, forced-crash rather than natural-idle recovery, incomplete proxy transport coverage, and no CAPTCHA guarantee. DoH setup is manual.
