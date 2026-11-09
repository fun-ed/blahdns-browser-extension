# Evaluation input: implementation acceptance

Date: 2026-11-09.

Build the privacy extension in `blahdns-browser-extension/` for Chrome, Brave, and Firefox. Include ad and content-farm blocking, user hosts and ABP rules, global and domain-tree scopes, URL tracking removal, WebRTC controls, User-Agent request headers, BlahDNS SG/DE DoH setup and tests, native fingerprint protection guidance, settings import/export, local statistics, WebSocket coverage, and HTTP/HTTPS/SOCKS proxies. Record HTTP/2, HTTP/3, and QUIC limits.

Use Bun 1.4.4 and current dependencies. Run development tools with `mise exec --`. Use Bun's native formatter, bundler, and test runner. Do not add ESLint or Prettier. Keep runtime dependencies empty. Use plain English. Preserve plans, contracts, roadmap, evaluation inputs and outputs. Add executable gates to AGENTS.md. Publish a public repository and GitHub prerelease under fun-ed with release packages.

Measure the bundled list compiler and package size before considering Rust/WASM. Do not claim CAPTCHA avoidance, full ABP support, a browser-wide DNS change, complete fingerprint anonymity, or complete UDP proxy coverage.

Acceptance scenarios are maintained in plan.md. Browser tests use an isolated temporary profile and local fixture server. They must not change the signed-in browser profile.
