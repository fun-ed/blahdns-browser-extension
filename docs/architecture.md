# Architecture

This document describes the 0.2.1 implementation. See [validation evidence](evals/0.2.1/acceptance-output.md) for the tested versions and remaining limits.

## Runtime flow

1. `extension/core/settings.js` validates settings and normalizes hostname patterns.
2. `extension/background.js` loads bundled and user-provided list text, stores settings locally, compiles rules, and updates browser DNR rules.
3. `extension/core/rules.js` converts supported hosts, ABP network, and CSS cosmetic syntax. `extension/content.js` cleans links. The background uses `scripting.insertCSS` for sender-scoped cosmetic rules so page CSP cannot block them.
4. `extension/core/privacy.js` uses browser-native controls where available. `extension/core/proxy.js` configures browser proxy routing. `extension/core/dns.js` performs an explicit DoH endpoint diagnostic.
5. `extension/ui/theme.js` resolves the saved System/Light/Dark preference for settings and popup. It changes extension CSS only; native media preference changes update System mode live.

Opening settings or popup calls read-only `readPrivacy` and `readProxy` status queries. They inspect actual native values and control priority without setting, clearing or registering listeners. Saves/startup/rollback retain the explicit apply path. A mismatched setting is reported instead of silently repaired during a read.

The extension runtime is JavaScript and browser DNR. It does not use a Rust/WASM matcher for each request. `adblock-rust` is a possible offline/build-time comparison or conversion tool, not a runtime dependency. Keep any Node-based evaluation build-time only; the repository's development and verification commands use mise-managed Bun.

## Filtering scope

Filtering can be global or limited to selected site domains. Both `example.com` and `*.example.com` match the apex and all subdomains. Label boundaries prevent `badexample.com` from matching `example.com`. Exceptions override filtering and header changes for matching sites. The proxy scope is separate and uses the destination hostname; a filtering exception does not bypass the proxy.

DNR evaluates supported requests in the browser. The rule resource type set includes WebSocket requests, so matching supported blocking rules can block WebSocket handshakes. This does not make the extension a general HTTP proxy or expose request bodies to its rule compiler.

## List syntax and diagnostics

Lists are untrusted text. They are parsed as rules; their contents are never executed.

| Input             | Supported subset                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosts             | Bare hostnames and host lines using `0.0.0.0`, `127.0.0.1`, `::`, or `::1` as the address.                                                                            |
| ABP network rules | URL filters, domain anchors, allow rules, resource types, third-party, match-case, important, and domain include/exclude modifiers. Regex rules must fit DNR syntax.  |
| Cosmetic rules    | `domain##selector` and `domain#@#selector`, including comma-separated included or excluded host scopes, when the selector passes the extension's basic safety checks. |

Supported resource modifiers are `document`, `subdocument`, `stylesheet`, `script`, `image`, `font`, `object`, `xmlhttprequest`, `ping`, `media`, `websocket`, and `other`. Supported options include `third-party` or `3p`, `match-case`, `important`, and hostname-based `domain=` include/exclude values. Example:

```text
||ads.example^$script,third-party
@@||allowed.example^
example.com##.advert
```

Firefox matches WebSocket handshakes as HTTP(S) URLs. The compiler adds a WebSocket-only HTTP(S) alias for literal `ws://` and `wss://` URL filters. It preserves the original action and does not apply that alias to ordinary HTTP traffic. Scheme-specific regex rules follow each browser's DNR behavior.

Comments and empty lines are counted as ignored. Unsupported modifiers, malformed hostnames, scriptlets, procedural or extended CSS, unsafe selectors, and unsupported regex features are reported with source and line diagnostics. No unsupported syntax should be described as working. The compiler currently rejects more than 4,500 total rules or 900 regex rules; browser quotas and behavior can also vary. See [Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) and the [uBlock Origin Lite FAQ](<https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)>) for platform context.

CSS comment delimiters are rejected in cosmetic selectors. A malformed rule such as `##.x/*` must not consume later valid generated rules; diagnostics retain its source and line. These checks are a bounded supported subset, not a complete CSS grammar implementation.

The `ads` snapshot is the original BlahDNS Lite ABP file from `https://oooo.b-cdn.net/blahdns/lite_adblocker.txt`; it retains supported network syntax instead of being reduced to domains. The `farms` snapshot is a domain-only projection of Content Farm Terminator. Source URLs, revisions or content hashes, license notes, input/output SHA-256 and parser counts are recorded in `extension/lists/sources.json`; full inputs remain under `data/upstream/`.

The default list works offline. An explicit Update list action downloads the fixed HTTPS URL without credentials, referrer or redirects, with a 4 MB bound. The background validates the prospective cache and compiles it before applying the existing settings transaction. A failed application or persistence step reapplies the old source; only a successful transaction updates the separate local cache. Custom subscriptions retain their existing bounds and manual update flow. No startup or scheduled request runs.

## Proxy and transport limits

The proxy settings accept HTTP, HTTPS, SOCKS4, and SOCKS5 endpoints. Routing can be global or selected by destination host, with domain bypass patterns. Firefox uses `proxy.onRequest`; Chromium uses its proxy settings/PAC support. The optional proxy permission is requested only when the user enables this feature. No credentials are stored.

The extension chooses a proxy route by destination hostname. HTTP/2, HTTP/3, QUIC, connection reuse, and proxy fallback are controlled by the browser and network stack. The extension cannot force a protocol or promise that every HTTP/3/QUIC connection follows the selected route. See [Chrome proxy settings](https://developer.chrome.com/docs/extensions/reference/api/proxy) and [Firefox `proxy.onRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest).

## Privacy controls

There are no JavaScript fingerprint-spoofing hooks. Language and custom User-Agent values change HTTP request headers only; they do not change JavaScript values, Client Hints, TLS, or worker behavior.

Firefox's native `privacy.websites.resistFingerprinting` control is opt-in and browser-wide. Depending on Firefox version, it may affect timezone, language, canvas, audio, and WebGL behavior, with compatibility costs. This policy is browser-owned; the extension does not emulate it with page scripts. Brave users should prefer the browser's [Shields panel](https://support.brave.com/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing) and site-specific controls. Chrome's [privacy API](https://developer.chrome.com/docs/extensions/reference/api/privacy) exposes selected browser settings, including WebRTC policy, but not a general extension control equivalent to Firefox Resist Fingerprinting.

WebRTC options use native browser controls when available. See [MDN's `privacy.network` reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network). Browser policy or another extension can prevent a requested setting from taking effect. Native mode and disable clear this extension's contribution even when another extension currently masks it. Other settings remain in place.

## DoH diagnostic

The diagnostic sends a fixed `example.com` A query using RFC 8484 POST to the selected endpoint:

- SG: `https://doh-sg.blahdns.com/dns-query`
- DE: `https://doh-de.blahdns.com/dns-query`

It reports endpoint, response code, answers, and latency. It does not configure DNS or establish that browser/device lookups use BlahDNS. Users must configure a browser's custom DoH setting manually if they want to use an endpoint for browser DNS.

## Permissions rationale

Review the generated manifests at each release. Permissions must have a direct feature reason:

| Access                                 | Reason                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Local storage                          | Keep settings, downloaded lists, and optional local aggregate counters on-device.                                            |
| DNR and host access                    | Apply blocking, redirects, header changes, and site scope to requests covered by the user's settings.                        |
| Browser privacy API                    | Apply supported browser-native WebRTC and Firefox fingerprinting settings when enabled.                                      |
| Scripting CSS API                      | Insert and remove validated cosmetic CSS in the sender frame, including pages with a strict CSP. No page script is injected. |
| Proxy API (optional)                   | Route matching requests only after the user enables and grants proxy access.                                                 |
| Debug rule feedback (development only) | Count blocked requests in unpacked builds where the browser exposes debug events.                                            |

Use the narrowest host-access model that supports the selected feature. Explain permission prompts in the UI; never add telemetry or broaden collection as a shortcut.

## Further reading

See [README](../README.md) for installation and limits, [PRIVACY.md](../PRIVACY.md) for data handling, and [research](research.md) for source-backed design decisions.
