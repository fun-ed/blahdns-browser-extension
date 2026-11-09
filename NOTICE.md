# Third-party notices

BlahDNS Browser Extension is free software under GPL-3.0-only. It has no warranty. See [LICENSE](LICENSE).

The packaged lists retain their original text in `data/upstream/` in the source repository. Source URLs, revisions or content hashes, SHA-256 checksums, domain/network counts, and omitted entries are in `extension/lists/sources.json`.

- BlahDNS Lite ABP, supplied by the project owner at https://oooo.b-cdn.net/blahdns/lite_adblocker.txt . The original ABP file is packaged unchanged. Copyright and licenses of its upstream components remain applicable. The CDN file does not publish its aggregation build manifest; this repository records the exact downloaded bytes and content hash, not a complete upstream provenance claim.
- Content Farm Terminator content-farms list. Copyright Danny Lin and contributors. GPL-3.0-only. Source: https://github.com/danny0838/content-farm-terminator . Converted to domain-only entries. Path rules, expressions, and templates are omitted and recorded in the source metadata. This list does not reproduce all upstream behavior.

Brave adblock-rust, AdGuard Browser Extension, uBlock Origin, and uBlock Origin Lite informed the architecture. No engine code from those projects is copied into this extension. Their names do not imply endorsement.

Corresponding source, build tools, and release tags: https://github.com/fun-ed/blahdns-browser-extension .

## Bundled libraries (MIT)

`tldts` and `tldts-core` (https://github.com/remusao/tldts) provide locally bundled Public Suffix List classification. Copyright (c) 2017 Thomas Parisot, 2018 Rémi Berson.

`re2js` (https://github.com/le0pard/re2js) provides linear-time matching for untrusted RE2 regex filters without WebAssembly or dynamic code execution. Copyright (c) 2023 Oleksii Vasyliev.

The following MIT terms apply to each library:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Public Suffix List data is derived from Mozilla's list, available with its source and Mozilla Public License 2.0 notice at https://publicsuffix.org/list/public_suffix_list.dat . License: https://www.mozilla.org/MPL/2.0/ .
