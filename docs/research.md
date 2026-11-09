# References

The runtime compiles supported filter text into browser DNR rules. JavaScript handles settings, parsing and diagnostics; the browser matches requests. The extension has no Rust/WASM runtime dependency. Compiler timings are not browser-performance or cross-language measurements.

## Browser APIs and design sources

- [Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [AdGuard MV3](https://adguard.com/kb/adguard-browser-extension/mv3-version/) and [uBlock Origin Lite FAQ](<https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)>): declarative filtering and MV3 limits.
- [Brave adblock-rust](https://github.com/brave/adblock-rust), [AdGuard](https://github.com/AdguardTeam/AdguardBrowserExtension) and [uBlock Origin](https://github.com/gorhill/uBlock): upstream filtering implementations. This project implements a smaller documented subset.
- [Chrome privacy](https://developer.chrome.com/docs/extensions/reference/api/privacy), [Firefox privacy.network](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network) and [privacy.websites](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/websites): native WebRTC and Firefox fingerprint controls.
- [Brave Shields](https://support.brave.com/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing): browser-owned privacy protection.
- [Chrome proxy](https://developer.chrome.com/docs/extensions/reference/api/proxy) and [Firefox proxy.onRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest): routing APIs. See the [Firefox wake findings](research-firefox-proxy-event-page.md) for synchronous event-page registration and the tested crash-recovery path.
- [Cloudflare challenge troubleshooting](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/): compatibility guidance, not a CAPTCHA bypass guarantee.

Exact Firefox fingerprint-surface coverage and transport behavior depend on browser versions and require runtime checks. Community posts, store descriptions and upstream features do not establish this extension's capabilities.

Current [verification](evals/0.2.4/acceptance-output.md) and [compiler benchmark](evals/0.2.4/benchmark-output.json) record what was tested. List sources, licenses and content hashes are recorded in `extension/lists/sources.json`.
