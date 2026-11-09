# Changelog

## 0.2.2 - 2026-11-09

- Reject unclosed quotes, brackets and parentheses, crossed closers, unfinished escapes and CSS newline controls in cosmetic selectors. Preserve supported balanced quoted and escaped tokens. Keep validation in the background parser.
- Add permanent HTTP/SOCKS5 enabled-proxy getState assertions to the browser matrix without relaxing exact PAC comparison.
- Verify 56 unit tests, 252 expectations and 21 integration checks in each browser, including actual CSS hiding and enabled HTTP/SOCKS5 proxy status. ZIP/XPI repeat-build hashes match.

## 0.2.1 - 2026-11-09

- Reject CSS comment delimiters in cosmetic selectors, so a malformed rule cannot comment out later valid generated rules. Report rejected rules in diagnostics.
- Separate readPrivacy/readProxy status queries from native writes. getState does not set/clear browser controls or change proxy listeners after initialization. Report actual mismatches and per-section read errors; retain explicit apply and rollback paths.
- Validate Chromium proxy read-back against the requested PAC contents and control priority.
- Verify 46 unit tests and 232 expectations; Chrome, Brave and Firefox each pass 19 integration checks, including the CSS regression and Chromium native-write spies. ZIP/XPI repeat-build hashes match.

## 0.2.0 - 2026-11-09

- Add System, Light, and Dark appearances for settings and popup. Preserve version-1 settings imports; missing appearance defaults to System. Website fingerprint values are unchanged.
- Replace the default ad source with the owner's BlahDNS Lite ABP URL. Keep its original 114,578 supported rules in the offline snapshot; preserve a separate content-farm control. Default compilation covers 126,170 distinct domains in 921 DNR rules.
- Add an explicit default-list update button, 4 MB download limit, local cache and transactional rollback. No scheduled or startup list fetch runs; custom subscription limits are unchanged.
- Produce unsigned Firefox XPI alongside Chromium/Firefox ZIPs and SHA256SUMS. XPI and Firefox ZIP are byte-identical. Mozilla signing is still required for ordinary permanent Firefox installation.
- Verify 40 unit tests and 204 expectations; Chrome and Brave each pass 17 integration checks, Firefox passes 18, including unmodified XPI installation. Light/Dark save-button contrast measures 5.35:1 and 10.68:1. Preserve prior release artifacts and versioned evaluation records.

## 0.1.0 - 2026-11-09

Initial GitHub prerelease for manual installation.

### Added

- Shared Manifest V3 source and separate Chromium and Firefox packages.
- Browser DNR filtering for 100,619 distinct bundled ad, tracker, and content-farm domains. The default configuration compiles to 225 rules.
- Global and selected-domain scopes, domain-tree exceptions, user hosts and ABP subsets, CSS hiding, and manual HTTPS subscriptions.
- Known tracking parameter removal, signed-URL exceptions, settings import/export, and optional local aggregate statistics.
- Native WebRTC policies, request-header User-Agent and en-US options, and opt-in Firefox native fingerprint resistance.
- BlahDNS SG/DE endpoint guidance and bounded RFC8484 POST diagnostics.
- Destination-scoped HTTP, HTTPS, SOCKS4, and SOCKS5 proxy configuration. Live integration covers HTTP and SOCKS5, including remote SOCKS5 DNS.
- Bun 1.4.4 tooling through mise, native formatting, repository syntax/policy checks, unit tests, browser integration, source hashes, and reproducible packages.
- Maintainer gates, development and release skills, versioned plans/contracts, research, evaluation inputs/outputs, and a roadmap.

### Verified

- 36 unit tests. Chrome and Brave integration each pass 14 checks. Firefox integration passes 15 checks.
- Real settings-page save, File import handling, serialized export content, WebSocket handshake blocking, strict-CSP cosmetic filtering, site scopes, header changes, aggregate counters, and proxy routes.
- SG and DE diagnostic queries return DNS NOERROR. Package and upstream SHA-256 checks match.
- Security review findings about masked native settings and subscription redirects were corrected and rechecked.

### Compatibility corrections

- Split URL-cleaning expressions to fit Chromium's compiled RE2 size limit.
- Read query text without a cross-realm URLSearchParams iterator in Firefox content scripts.
- Add WebSocket-only HTTP(S) aliases for Firefox's handshake matching.

### Limits

DoH setup is manual. WebRTC and Firefox fingerprint resistance are browser-wide. UA and language options change request headers only. The extension does not inject fingerprint noise or guarantee CAPTCHA acceptance. HTTP/2, HTTP/3, QUIC, and UDP coverage depend on the browser and proxy. Browser-store signing is not part of this GitHub release. See [validation](docs/evals/acceptance-output.md) for the exact tested scope and remaining checks.
