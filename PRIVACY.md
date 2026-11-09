# Privacy policy

Policy for the 0.2.5 preview. See [validation evidence](docs/evals/0.2.5/acceptance-output.md) for tested behavior and limits.

## What stays in your browser

The extension keeps its settings in browser-local storage. This includes appearance, enabled features, site scopes and exceptions, custom rules, subscription URLs and downloaded text, selected privacy settings, proxy address and port, and optional statistics. A manually updated default list and its download timestamp are cached separately in local storage. Proxy credentials are not stored by this extension. Appearance affects extension pages only.

The optional manual DoH record stores only your selection of unknown, enabled or disabled. It does not read browser DNS settings or change the resolver.

The extension does not send browsing history, page URLs, or usage analytics to BlahDNS. It has no cloud settings sync or remote code. Network rules are applied by the browser's DNR API.

## Optional network requests

- **Default BlahDNS Lite list:** The extension includes an offline ABP snapshot and makes no startup or scheduled update request. When you choose Update list, it downloads `https://oooo.b-cdn.net/blahdns/lite_adblocker.txt` without cookies or a referrer. The CDN can see ordinary request metadata, including your IP address. A successful update is cached locally; failure preserves previous rules.
- **Filter subscriptions:** When you request an update, the extension downloads the configured HTTPS list. The list server can see the request and normal network metadata, such as your IP address. The extension omits credentials and the referrer. Subscription text is stored locally for rule compilation.
- **DNS diagnostic:** When you choose Test DNS, the extension sends a fixed `example.com` A query to the selected endpoint: `https://doh-sg.blahdns.com/dns-query` or `https://doh-de.blahdns.com/dns-query`. The selected endpoint receives the query and ordinary connection metadata. This test does not configure DNS for the browser or device. Server-side logging and retention are governed by the endpoint operator's policy, which this extension cannot control.
- **Proxy routing:** If enabled, matching destination traffic is sent to the proxy server you configured. That server can observe the traffic information its proxy protocol permits. The extension does not store proxy credentials.

The extension has no other planned service connection for telemetry, analytics, or settings sync.

## Optional local counters

Statistics are off by default and can be enabled by the user. Counters are stored locally and contain totals only, with no URL, domain, timestamp, or browsing history. Exact blocked-request counts depend on browser debug feedback and are available only in unpacked development builds where that feedback is exposed. No counter data is uploaded.

## Browser privacy settings

The extension does not inject JavaScript to fake canvas, audio, WebGL, language, timezone, or other browser fingerprint values. A custom User-Agent and the `en-US` language option affect HTTP request headers only; page JavaScript, Client Hints, TLS, and workers are not synchronized.

Firefox's native Resist Fingerprinting option is opt-in and browser-wide. Depending on Firefox version, it may affect timezone, language, canvas, audio, and WebGL behavior; sites may work differently. The extension does not implement these changes with JavaScript. Supported native settings are applied only when available and controlled by the extension; disabling the setting releases controls owned by the extension. Chrome and Brave retain their own browser privacy controls. Use [Brave Shields](https://support.brave.com/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing) for Brave-native settings.

After background initialization, status queries from settings or popup inspect native values without setting, clearing or repairing them. Initialization, explicit saves and rollback retain the apply path. A native mismatch is reported so the user can choose to save and reapply settings.

## Your choices

You can leave statistics off, remove subscriptions, disable individual features, change site exceptions, disable proxy routing, or remove the extension. Check the browser's extension settings if you want to clear locally stored extension data.

## Limitations

This extension does not guarantee anonymity, prevent every form of tracking, or bypass CAPTCHAs. Browser updates, network configuration, proxy support, and third-party list or DNS services can change behavior. See [architecture](docs/architecture.md) and [research](docs/research.md) for current scope and sources.
