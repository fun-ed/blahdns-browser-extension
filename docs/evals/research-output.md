# Research output

> Source review date: 2026-11-09. A compiler-only benchmark is recorded below; browser integration and release verification remain pending.

## Facts supported by sources

- Brave's [`adblock-rust`](https://github.com/brave/adblock-rust) is a reusable Rust filtering engine with native and WASM targets, hosts rules, uBlock-compatible syntax, network and cosmetic filtering, and resource replacements. The project does not provide a turnkey MV3 extension.
- [AdGuard's MV3 notes](https://adguard.com/kb/adguard-browser-extension/mv3-version/) describe static and dynamic DNR rules, filter updates, and unsupported MV3 behaviors. Its [deployment guide](https://github.com/AdguardTeam/AdguardBrowserExtension/blob/master/DEPLOYMENT.md) documents separate browser package and release flows.
- [uBlock Origin](https://github.com/gorhill/uBlock) is the full extension project; [uBlock Origin Lite's FAQ](<https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)>) describes a separate declarative MV3 product and lists features that cannot be represented by DNR. These are different products and should not be described as feature-equivalent.
- Chrome's [DNR reference](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) documents browser-enforced declarative rules, permission modes, resource types, and quotas. DNR can block or modify matching requests without an extension inspecting their content. Quotas depend on API version and browser state; use the current browser docs and runtime APIs when sizing rules.
- Chrome's [privacy API](https://developer.chrome.com/docs/extensions/reference/api/privacy) exposes selected browser controls including WebRTC IP handling. MDN's Firefox [privacy websites API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/websites) documents `resistFingerprinting` as a control affecting browser-visible fingerprint data, including timezone. The product policy describes possible timezone, language, canvas, audio, and WebGL effects as Firefox-version dependent; verify exact coverage against each supported browser build. MDN's [`privacy.network`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network) documents native WebRTC controls.
- Brave describes browser-owned fingerprinting protections and per-site controls in its [Shields help](https://support.brave.com/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing) and [fingerprinting defenses overview](https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/). The latter explains per-session and per-site randomization for several fingerprintable APIs; it does not show that an extension can reproduce the same coverage.
- Chrome's [proxy API](https://developer.chrome.com/docs/extensions/reference/api/proxy) and MDN's Firefox [`proxy.onRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest) describe browser-managed proxy selection. They do not establish that an extension can control every protocol negotiation, HTTP/2 reuse, HTTP/3/QUIC path, or proxy fallback.
- Cloudflare's [challenge troubleshooting](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/) lists network problems, browser settings or extensions blocking challenge scripts, unsupported browsers, disabled JavaScript, and bot signals as possible causes. It does not promise that disabling this extension solves every challenge or support a CAPTCHA-bypass claim.
- The uBlock and AdGuard store pages on [Chrome Web Store](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/) and the corresponding [AdGuard Chrome](https://chromewebstore.google.com/detail/adguard-adblocker/bgnkhhnnamicmpeenaelnjfhikgbkllg) and [Firefox](https://addons.mozilla.org/en-US/firefox/addon/adguard-adblocker/) listings contain publisher disclosures. They are useful examples, not independent audits.

Current domain counts and skipped farm entries are recorded with revisions and hashes in [`extension/lists/sources.json`](../../extension/lists/sources.json). The bundled lists are domain-only. The first conversion's UUID-shaped marker and later correction are described in [the list conversion evaluation](list-conversion-output.md).

## Local benchmark evidence

The compiler benchmark ran on Bun 1.4.4 / darwin arm64 with one warm-up and 20 iterations. It compiled 2,106,946 input bytes across 100,619 unique domains into 204 DNR rules and 2,356,636 JSON bytes. Median time was 71.41 ms and p95 was 83.31 ms; RSS covers the full Bun process. This is compiler-only: there was no browser or network measurement and no Rust/WASM or Node comparison. See [the full benchmark output](benchmark-output.json).

## Decisions for this repository

1. Keep the browser runtime in JavaScript and compile supported rule syntax into DNR. Use browser enforcement instead of intercepting every request in an extension worker.
2. Keep Rust/WASM out of the live request path. If a Rust engine or Node script is evaluated, run it offline/build-time only and compare outputs against known cases. Do not claim a speed or coverage win until measured.
3. Prefer native controls: Firefox RFP is opt-in and browser-wide; Brave users should use native Shields. Chrome does not expose a broad extension setting equivalent to Firefox RFP. The extension's language and User-Agent controls change HTTP headers only.
4. Explain DNR syntax gaps and report unsupported list rules. Do not silently claim full hosts/ABP compatibility.
5. Document HTTP/HTTPS/SOCKS4/SOCKS5 proxy types and destination-host selection, with HTTP/2, HTTP/3, QUIC, and fallback caveats controlled by the browser.
6. Treat SG/DE DoH as manual browser configuration endpoints. The extension's fixed `example.com` query only checks endpoint connectivity and response.
7. Make no promise of CAPTCHA bypass. Site-specific troubleshooting is a diagnostic option, not a guaranteed fix.

## Secondary sources and limits

The [Reddit discussion](https://www.reddit.com/r/degoogle/comments/1tfm6ic/canvas_fingerprinting_alone_still-identifies_my/) includes user reports about fingerprinting and disagreement in comments. The [Medium fingerprinting article](https://medium.com/@partnerhbhl/browser-fingerprinting-101-what-gets-tracked-and-how-to-test-it-70c481972599) and [Medium TLS/Cloudflare article](https://medium.com/@238rodionova/bypassing-cloudflare-in-2026-tls-fingerprinting-explained-463993b4f474) are practitioner commentary. None is used as proof of browser, TLS, or Cloudflare internals.

Mozilla Support's [Resist Fingerprinting article](https://support.mozilla.org/en-US/kb/resist-fingerprinting) could not be read in this research pass. MDN supports the general browser-wide setting and timezone effect, but exact canvas, audio, WebGL, and language coverage must be checked against supported Firefox builds. No live browser package was tested. The compiler benchmark's process-wide RSS is not a browser memory measurement; no browser CPU/memory, blocking-accuracy, or CAPTCHA results were collected.
