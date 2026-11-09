# Changelog

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
