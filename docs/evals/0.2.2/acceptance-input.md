# 0.2.2 acceptance input

Follow [the scoped plan](../../plans/005-selector-structure.md). Verify unclosed quotes, brackets, parentheses, mismatched closers, terminal backslash and CSS string newline controls cannot consume later generated rules. Preserve balanced quoted/escaped cases. Verify actual hiding under strict CSP in Chrome, Brave and Firefox.

After enabling each HTTP and SOCKS5 fixture proxy, call getState and assert settings.proxy.enabled and proxyStatus.applied are true; then verify actual routed requests. Keep existing readonly spies and native privacy/proxy regressions.

Run all repository gates, benchmark and repeat builds. Require exact-source CI, then publish Chromium ZIP, Firefox ZIP, unsigned XPI and SHA256SUMS. Download and independently verify bytes/hashes and old tag targets. Store signing, CRX, full CSS grammar and untested browser versions remain outside scope.
