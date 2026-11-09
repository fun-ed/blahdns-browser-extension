# Runtime contract

Settings version: 1. Source uses JavaScript ES modules. Bun bundles the content script into a local IIFE and the Firefox filter with pinned `tldts` PSL data and `re2js` linear-time regex matching into a local ES module. Chromium uses an MV3 service worker and native DNR matching. Firefox uses an MV3 module event page: `webRequest` handles blocking and query-cleaning redirects, while native DNR retains allow rules and header changes. No WebAssembly, generated code or remote engine is required. All development commands run through `mise exec --`.

## Settings

```js
{
  version: 1,
  enabled: true,
  theme: 'system',
  mode: 'global',
  sites: [],
  exceptions: [],
  adblock: true,
  contentFarms: true,
  cleanUrls: true,
  customRules: '',
  subscriptions: [],
  statsEnabled: false,
  dnsRegion: 'sg',
  dohManualStatus: 'unknown',
  privacy: {
    webrtc: 'native',
    fingerprinting: 'native',
    language: 'native',
    userAgent: '',
  },
  proxy: {
    enabled: false,
    type: 'http',
    host: '127.0.0.1',
    port: 8080,
    mode: 'global',
    sites: [],
    bypass: [],
  },
}
```

`mode` is `global` or `sites`. A domain and its `*.domain` form both include the domain and all its subdomains. Label boundaries prevent `badexample.com` from matching `example.com`. Exceptions take precedence over filtering. Proxy scope is separate and matches the destination host. A filtering pause does not create a proxy bypass.

`theme` is `system`, `light`, or `dark`; missing `theme` in a version-1 import becomes `system`. It controls extension UI only. System follows the operating-system color preference and updates live.

`dohManualStatus` is `unknown`, `enabled` or `disabled`. It records the user's manual confirmation of browser DoH only; it neither changes nor detects the browser resolver. Missing values in version-1 imports default to `unknown`; invalid values are rejected. Save, import and export preserve the record. DNS diagnostics and the master filtering switch do not update it.

WebRTC values are `native`, `public`, and `proxy`. Fingerprint protection values are `native` and `resist`. `resist` requires Firefox's native browser-wide setting. Language is `native` or `en-US`. Language and User-Agent changes affect HTTP request headers only. They do not alter JavaScript, Client Hints, TLS, or workers. Proxy types are `http`, `https`, `socks4`, and `socks5`. The master `enabled` switch releases proxy and native privacy settings as well as filtering.

Subscriptions are `{url, text, updatedAt}`. Only HTTPS URLs without credentials or fragments are accepted. A subscription is limited to 2 MB. All custom text is limited to 4 MB. Settings validation strips unknown properties and rejects wrong types. Only the options page and popup can call privileged commands.

The default ad source is `https://oooo.b-cdn.net/blahdns/lite_adblocker.txt`. An unchanged ABP snapshot ships offline. A separate local cache `{url,text,updatedAt}` may replace it after an explicit update; the fixed URL and field types are validated, downloads are bounded to 4 MB, and unsupported or unexpectedly small default lists are rejected. No automatic update runs. The `adblock` switch controls this source. The default cache is separate from exported settings and custom subscriptions.

## Messages

Responses are `{ok:true,...}` or `{ok:false,error}`. `getState` and `saveSettings` return `{ok,settings,defaultList,report,stats,capabilities,privacyStatus,proxyStatus}`. `defaultList` is `{url,updatedAt}`; null `updatedAt` means the bundled snapshot. A default-list update uses the existing settings transaction with a prospective cache; failure restores the previous compiled rules and preserves persisted settings/cache.

| Message               | Input                      | Output or effect                                                                                                                     |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `getState`            | None                       | Read current validated settings and actual native status; never set/clear settings or change proxy listeners                         |
| `getTabActivity`      | `tabId`                    | `{ok,enabled,available,reason,activity}` for a non-private HTTP(S) tab; extension UI only                                            |
| `saveSettings`        | `settings`                 | Validate, compile, apply, and persist; restore the previous state on failure                                                         |
| `previewRules`        | `settings`                 | `{ok,report}` without changing active rules                                                                                          |
| `testDns`             | `region`                   | `{ok,result}` for a fixed example.com A query                                                                                        |
| `updateSubscriptions` | None                       | Download current subscriptions without cookies, then recompile as one settings update                                                |
| `updateDefaultList`   | None                       | Download the fixed BlahDNS Lite URL without credentials or redirects, validate, and transactionally replace the default source cache |
| `resetStats`          | None                       | Remove aggregate counters and all temporary per-tab statistics                                                                       |
| `setSite`             | `domain`, `paused` boolean | Add or remove a domain-tree filtering exception                                                                                      |
| `getPolicy`           | None                       | Policy for the sender frame and tab; callers cannot supply a different URL                                                           |
| `recordStats`         | `kind`, bounded `amount`   | Content-script aggregate events only; no browsing history                                                                            |

`report` has `rules`, `domains`, `cosmetic`, `unsupported`, `ignored`, and `accepted`; state responses additionally expose `nativeRules`, the installed DNR subset size. Each unsupported item has `line`, `reason`, and `source`. `capabilities` has `firefox`, `proxyPermission`, `rfp`, `dnrFeedback`, `blockingStats` and `nativeFallback`. Aggregate statistics have `cleanedLinks`, `cosmeticPages`, and `blockedRequests`. Blocking counts come from Firefox's own cancellation decisions or real Chrome/Brave DNR debug events in unpacked installations. Unrelated network failures are not counted. Statistics remain opt-in.

`activity` is null when statistics are off; otherwise it contains `blockedRequests`, `cleanedRequests` and at most ten `recent` entries `{ruleId,action,filter,hits}`. Only block/redirect actions are recorded. Filters are bounded to 240 characters; no request URL, path, query, page hostname, or timestamp is retained. A filter can itself contain a static hostname/path/query from the configured rule. Session storage survives background sleep; tab loading, tab closure, successful settings changes, reset, and browser restart discard recent data. Disabling collection clears the session data while preserving existing aggregate totals. Reading diagnostics cannot supply or fabricate rule hits.

Main-frame actions and tab-loading events share a navigation boundary so the landing page keeps its own block/cleaning decision. Request IDs and loading state remain in memory only. Queued events captured before a reset and events for closed tabs cannot repopulate current per-tab data. Counters describe actions in this tab since that boundary; unload requests issued after navigation starts can be included, rather than maintaining separate document histories or retaining page URLs. Chrome waits for startup compilation before attributing the event that wakes its service worker. If a validated Firefox configuration cannot build its JavaScript matcher, startup attempts native DNR fallback; a successful fallback keeps filtering and explicitly disables request statistics until the rule error is repaired. Failed repairs restore the previous native fallback snapshot. Unreadable or invalid stored settings produce an explicit uninitialized-filtering error and leave existing native rules unchanged.

`readPrivacy` and `readProxy` query native values and control priority without repairing mismatches. Chromium proxy status compares the actual PAC with the requested PAC. Apply operations remain in startup, settings saves and rollback; proxy-listener lifecycle remains in startup, apply and permission events. Native read errors are reported per section so the settings UI stays reachable. Cosmetic selectors containing CSS comment delimiters are unsupported and diagnosed before CSS generation.

Apply operations verify native read-back, including exact Chromium PAC contents after set and released control after clear. Failed native release rejects the settings transaction and restores the previous settings and rules. A missing optional proxy API before permission is granted is reported as a permission state. Firefox registers its proxy listener synchronously at module startup when the API is exposed, before asynchronous permission queries, so it can persist for event-page wake-up. Permission events still reconcile the listener.

Cosmetic selectors must also have balanced quotes, brackets and parentheses, matching closer order, complete escapes, and no CSS newline controls. Quoted bracket/parenthesis characters and supported escaped tokens do not affect structural depth. Validation is performed in the background parser before CSS generation; it is not a complete CSS grammar parser.

## Module ownership boundaries

- `core/settings.js`: defaults, settings validation, IDNA normalization, and domain-tree matching.
- `core/rules.js`: explicit ABP subset, cosmetic selectors, and deterministic DNR compilation. Reject unsupported modifiers. Batch pure host domains without changing their meaning.
- `core/cleaner.js`: known tracking parameters and signed-URL preservation.
- `core/firefox-filter.js`: indexed, precompiled matching of the compiler's supported rule subset, including priorities, frame allowances and PSL-based first/third-party classification; unknown condition/action shapes fail before application.
- `core/tab-activity.js`: bounded per-tab counters and recent rules in session storage; callers serialize writes through the background queue.
- `core/privacy.js`: native API control and read-back. Clear this extension's own contribution on native mode or disable, even when another extension masks it. Preserve other extensions and the user's underlying setting.
- `core/proxy.js`: validated proxy routing, pure PAC generation, Firefox ProxyInfo, and native Chromium application. Selected destinations have no direct failover.
- `core/dns.js`: fixed BlahDNS endpoints and validated DNS wire-format diagnostics.
- `background.js`: lifecycle, storage, serialized transactions, permission boundaries, and Firefox proxy listener registration.
- `content.js`: bounded link cleaning and sender-scoped CSS hiding through `scripting.insertCSS`. `getPolicy` accepts the previous CSS text for removal and returns `css` and `cosmeticApplied`. The background derives new selectors from validated rules. No remote or generated page script execution.
- `ui/`: accessible settings and popup, message-based access, and local file import/export. Render untrusted text with textContent.

## Development evidence

Keep useful current test results, source versions, commands and limitations in `docs/evals/<version>/`. Superseded plans, contracts and intermediate runs remain in Git history. Records must not contain credentials, browser profiles or raw conversations.

## Package formats

The build produces Chromium ZIP, Firefox ZIP, unsigned Firefox XPI, and SHA256SUMS. XPI is byte-identical to Firefox ZIP and contains manifest.json at archive root. Ordinary Firefox permanent installation requires Mozilla signing; temporary development loading is the tested route. No CRX signing or store submission is included.
