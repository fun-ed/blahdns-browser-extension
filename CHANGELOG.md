# Changelog

## 0.2.7 - 2026-11-10

- Continue startup filtering, privacy and proxy setup when temporary statistics cannot be cleared; report the cleanup failure instead of skipping configuration.
- Preserve per-tab counts across repeated loading events during one navigation. Reset on a new main-frame request or loading after completion without an extra repeat flag.
- Poll the background popup's DOM on a timer in browser tests. Add Firefox/Chrome startup-failure and repeated-loading regressions.

## 0.2.6 - 2026-11-10

- Add popup opt-in, per-tab blocked/cleaned request counts and the ten most recent matching rules. Keep recent data in session storage and clear it on navigation, tab close, settings changes, opt-out, reset or restart.
- Use Firefox-only `webRequest` and `webRequestBlocking` for observable cancellation and query-cleaning decisions; keep native header changes and allowances. Chrome/Brave retain DNR and unpacked-build feedback. Do not count unrelated request failures as extension blocks.
- Bundle pinned `tldts` PSL data for first/third-party classification and `re2js` for linear-time matching of untrusted regex filters, without WebAssembly or CSP expansion. Add regression cases for URL syntax, priorities, site/frame/worker scope, signed URLs, transaction rollback and statistics boundaries.

## 0.2.5 - 2026-11-10

- Add a manually recorded browser DoH status: Not confirmed, On or Off. Save settings preserves it across reopening and settings import/export; DNS tests do not update or detect it.
- Default missing values in older version-1 settings to unknown and reject unsupported values. No new browser permission or dependency.

## 0.2.4 - 2026-11-10

- Remove superseded plans, contract snapshots, intermediate test records and repeated documentation. Keep current guidance and verification evidence; historical records remain in Git.
- Remove two CSS design-note comments. Filtering, settings, permissions and privacy behavior are unchanged.

## 0.2.3 - 2026-11-09

- Verify proxy PAC contents after set and control priority after clear. Failed native privacy/proxy release rolls back settings and rules.
- Correct optional proxy permission guidance on first install.
- Register Firefox proxy listeners synchronously so selected requests can wake the background after an extension-process crash.

## 0.2.2 - 2026-11-09

- Reject unbalanced quotes, delimiters, unfinished escapes and CSS newline controls in cosmetic selectors. Preserve supported quoted and escaped tokens.
- Add enabled HTTP/SOCKS5 proxy-status assertions to browser integration tests.

## 0.2.1 - 2026-11-09

- Reject CSS comment delimiters so malformed cosmetic rules cannot suppress later rules.
- Make native status queries read-only and validate Chromium PAC contents and control priority.

## 0.2.0 - 2026-11-09

- Add System, Light and Dark appearances.
- Use BlahDNS Lite ABP as the offline default, with manual updates, local caching and rollback.
- Add unsigned Firefox XPI packages, byte-identical to Firefox ZIPs.

## 0.1.0 - 2026-11-09

Initial preview with DNR filtering, supported hosts/ABP/CSS rules, site scopes, URL cleaning, native privacy controls, destination-scoped proxies, DoH diagnostics, settings import/export and local counters.

See the [current verification record](docs/evals/0.2.7/acceptance-output.md) for tested versions and limits.
