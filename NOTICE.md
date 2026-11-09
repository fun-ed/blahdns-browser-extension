# Third-party notices

BlahDNS Browser Extension is free software under GPL-3.0-only. It has no warranty. See [LICENSE](LICENSE).

The packaged domain lists are derived works. Their original text is retained in `data/upstream/` in the source repository. Exact revisions, source URLs, SHA-256 hashes, domain counts, and omitted entries are in `extension/lists/sources.json`.

- HaGeZi DNS Blocklists, Multi LIGHT. Copyright its contributors. GPL-3.0-only. Source: https://github.com/hagezi/dns-blocklists . Converted to normalized domain-only entries. Domain rules include subdomains.
- Content Farm Terminator content-farms list. Copyright Danny Lin and contributors. GPL-3.0-only. Source: https://github.com/danny0838/content-farm-terminator . Converted to domain-only entries. Path rules, expressions, and templates are omitted and recorded in the source metadata. This list does not reproduce all upstream behavior.

Brave adblock-rust, AdGuard Browser Extension, uBlock Origin, and uBlock Origin Lite informed the architecture. No engine code from those projects is copied into this extension. Their names do not imply endorsement.

Corresponding source, build tools, and release tags: https://github.com/fun-ed/blahdns-browser-extension .
