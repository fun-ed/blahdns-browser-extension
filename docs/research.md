# Research notes

Research conclusions were checked against the linked sources. Current runtime evidence is recorded separately in [0.2.0 acceptance output](evals/0.2.0/acceptance-output.md); earlier 0.1.0 records are retained.

Sources checked: 2026-11-09.

## Architecture choice: JavaScript compiled to DNR

Keep the extension runtime in JavaScript and compile supported filter rules into the browser's DNR API. The browser evaluates declarative rules; extension code handles settings, list parsing, diagnostics, and UI messages. This matches the lightweight MV3 direction in [uBlock Origin Lite's FAQ](<https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)>) and the MV3 design documented by [AdGuard](https://adguard.com/kb/adguard-browser-extension/mv3-version/). DNR has rule and syntax limits, so unsupported source rules need visible diagnostics.

[Brave's `adblock-rust`](https://github.com/brave/adblock-rust) is a reusable Rust engine with native and WASM builds, hosts and uBlock-compatible syntax, cosmetic filtering, and resource replacement. It is an engine, not a complete MV3 extension. Using it at runtime would add WASM integration and lifecycle work without removing the need to map results to browser permissions and DNR behavior. The repository's compiler benchmark does not compare this engine or measure browser runtime performance.

Decision: retain JS parsing and DNR for runtime. If a Rust/WASM or Node-based comparison is useful, run it as an offline build-time evaluation only. Do not ship Node or run a WASM matcher for every browser request unless a measured requirement justifies the added runtime. The project's day-to-day commands use mise-managed Bun.

Sources: [Chrome DNR API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [AdGuard MV3 notes](https://adguard.com/kb/adguard-browser-extension/mv3-version/), [AdGuard deployment guide](https://github.com/AdguardTeam/AdguardBrowserExtension/blob/master/DEPLOYMENT.md), [uBlock Origin repository](https://github.com/gorhill/uBlock), and [uBlock Origin Lite FAQ](<https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)>). Product documentation and APIs can change; check current vendor docs when changing browser support or quotas.

## Bundled list snapshot

The owner selected [BlahDNS Lite ABP](https://oooo.b-cdn.net/blahdns/lite_adblocker.txt) as the 0.2.0 default. Inspection found 114,578 supported rules: 113,933 domain entries and 645 other network rules, with no unsupported input. Preserve its original bytes and pin the mutable CDN response by SHA-256. Keep the separate Content Farm Terminator domain projection. Source URLs, hashes, counts and omitted farm entries are in `extension/lists/sources.json`; inputs remain under `data/upstream/`. The [first-conversion evaluation](evals/list-conversion-output.md) describes the earlier 0.1.0 conversion, not the current raw ABP snapshot.

## Fingerprinting and browser compatibility

Prefer controls implemented by the browser. The extension does not inject random values into JavaScript APIs. Changing only one canvas/audio/WebGL value can be inconsistent with other signals; browser-owned protections can coordinate more surfaces. This is a design risk assessment, not a claim that every noise extension is detectable or causes a challenge.

- Firefox offers an opt-in native `privacy.websites.resistFingerprinting` setting. MDN describes it as changing browser-visible fingerprint data, including timezone. The product policy documents that, depending on Firefox version, it may affect timezone, language, canvas, audio, and WebGL behavior. See [MDN `privacy.websites`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/websites); the Mozilla Support [Resist Fingerprinting help page](https://support.mozilla.org/en-US/kb/resist-fingerprinting) was not readable during this research pass, so verify exact surface coverage on each supported Firefox build before release.
- Brave has its own Shields and fingerprint protections. Use the [Brave Shields help](https://support.brave.com/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing) and [Brave's fingerprinting defenses overview](https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/) for browser-native behavior and per-site guidance.
- Chrome exposes selected native settings through its [privacy API](https://developer.chrome.com/docs/extensions/reference/api/privacy), including WebRTC IP handling. MDN's [`privacy.network`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network) describes WebRTC controls. Chrome does not expose a broad extension setting equivalent to Firefox RFP.
- Language and custom User-Agent options in this project change HTTP headers only. They do not synchronize page JavaScript, Client Hints, TLS, or workers.

Cloudflare says challenge loops can result from network issues, browser settings or extensions blocking required scripts, unsupported browsers, disabled JavaScript, or bot signals. This supports a compatibility warning, not a bypass promise or a claim that fingerprint noise alone causes a challenge. See [Cloudflare's challenge troubleshooting guide](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/) and [Turnstile documentation](https://developers.cloudflare.com/turnstile/).

## Proxy and transport

The implementation accepts HTTP, HTTPS, SOCKS4, and SOCKS5 proxy types and selects by destination hostname. Chrome's [proxy API docs](https://developer.chrome.com/docs/extensions/reference/api/proxy) and MDN's [Firefox `proxy.onRequest` docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest) describe browser-managed proxy configuration. They do not let this extension force all network protocol negotiation. HTTP/2, HTTP/3, QUIC, connection reuse, and fallback remain browser/network behavior; test the exact browser and proxy when making compatibility claims.

DNR's request resource types include WebSocket. Blocking a supported matching WebSocket request is distinct from proxying all application traffic. See the [DNR API reference](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

## DoH diagnostic

The SG and DE endpoints are intended for manual browser DoH configuration. The extension's check sends one fixed `example.com` A query to the selected endpoint and reports the answer and latency. It does not change DNS settings or control all browser/device DNS requests. A check also exposes the query and ordinary network metadata to the selected endpoint.

## Store and community material

Store listings show the publisher's claims and disclosures, not independent proof of runtime behavior:

- [uBlock Origin Lite on Chrome Web Store](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh)
- [uBlock Origin on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)
- [AdGuard AdBlocker on Chrome Web Store](https://chromewebstore.google.com/detail/adguard-adblocker/bgnkhhnnamicmpeenaelnjfhikgbkllg)
- [AdGuard AdBlocker on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/adguard-adblocker/)

Community commentary was checked only as anecdotal context. A [Reddit discussion about canvas fingerprinting](https://www.reddit.com/r/degoogle/comments/1tfm6ic/canvas_fingerprinting_alone_still_identifies_my/) contains user reports and disagreement; it is not a measurement. These [Medium articles on fingerprinting](https://medium.com/@partnerhbhl/browser-fingerprinting-101-what-gets-tracked-and-how-to-test-it-70c481972599) and [Cloudflare/TLS fingerprinting](https://medium.com/@238rodionova/bypassing-cloudflare-in-2026-tls-fingerprinting-explained-463993b4f474) are commentary, not authoritative evidence about browser internals or Cloudflare detection. Do not turn them into extension claims.

## Source limitations

The repository has a compiler-only benchmark on Bun 1.4.4 / darwin arm64 with one warm-up and 20 measured iterations. See the current [benchmark output](evals/0.2.0/benchmark-output.json). It does not measure browser request latency or compare Rust/WASM or Node. Browser verification has its own [matrix and limitations](evals/0.2.0/acceptance-output.md).
