# Runtime contract

Version: 1. Runtime dependencies: none. Source uses JavaScript ES modules. Bun bundles the content script into a local IIFE. Chromium uses an MV3 service worker. Firefox uses an MV3 module event page. All development commands run through `mise exec --`.

## Settings

```js
{
  version: 1,
  enabled: true,
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

WebRTC values are `native`, `public`, and `proxy`. Fingerprint protection values are `native` and `resist`. `resist` requires Firefox's native browser-wide setting. Language is `native` or `en-US`. Language and User-Agent changes affect HTTP request headers only. They do not alter JavaScript, Client Hints, TLS, or workers. Proxy types are `http`, `https`, `socks4`, and `socks5`. The master `enabled` switch releases proxy and native privacy settings as well as filtering.

Subscriptions are `{url, text, updatedAt}`. Only HTTPS URLs without credentials or fragments are accepted. A subscription is limited to 2 MB. All custom text is limited to 4 MB. Settings validation strips unknown properties and rejects wrong types. Only the options page and popup can call privileged commands.

## Messages

Responses are `{ok:true,...}` or `{ok:false,error}`. `getState` and `saveSettings` return `{ok,settings,report,stats,capabilities,privacyStatus,proxyStatus}`.

| Message               | Input                      | Output or effect                                                                      |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `getState`            | None                       | Current validated settings and status                                                 |
| `saveSettings`        | `settings`                 | Validate, compile, apply, and persist; restore the previous state on failure          |
| `previewRules`        | `settings`                 | `{ok,report}` without changing active rules                                           |
| `testDns`             | `region`                   | `{ok,result}` for a fixed example.com A query                                         |
| `updateSubscriptions` | None                       | Download current subscriptions without cookies, then recompile as one settings update |
| `resetStats`          | None                       | Remove aggregate counters                                                             |
| `setSite`             | `domain`, `paused` boolean | Add or remove a domain-tree filtering exception                                       |
| `getPolicy`           | None                       | Policy for the sender frame and tab; callers cannot supply a different URL            |
| `recordStats`         | `kind`, bounded `amount`   | Content-script aggregate events only; no browsing history                             |

`report` has `rules`, `domains`, `cosmetic`, `unsupported`, `ignored`, and `accepted`. Each unsupported item has `line`, `reason`, and `source`. `capabilities` has `firefox`, `proxyPermission`, `rfp`, and `dnrFeedback`. Statistics have `cleanedLinks`, `cosmeticPages`, and `blockedRequests`. A blocked count is available only from real DNR debug events during development. It is not an estimate of production blocking.

## Module ownership boundaries

- `core/settings.js`: defaults, settings validation, IDNA normalization, and domain-tree matching.
- `core/rules.js`: explicit ABP subset, cosmetic selectors, and deterministic DNR compilation. Reject unsupported modifiers. Batch pure host domains without changing their meaning.
- `core/cleaner.js`: known tracking parameters and signed-URL preservation.
- `core/privacy.js`: native API control and read-back. Clear only settings controlled by this extension.
- `core/proxy.js`: validated proxy routing, pure PAC generation, Firefox ProxyInfo, and native Chromium application. Selected destinations have no direct failover.
- `core/dns.js`: fixed BlahDNS endpoints and validated DNS wire-format diagnostics.
- `background.js`: lifecycle, storage, serialized transactions, permission boundaries, and Firefox proxy listener registration.
- `content.js`: bounded link cleaning and CSS hiding; no remote or generated script execution.
- `ui/`: accessible settings and popup, message-based access, and local file import/export. Render untrusted text with textContent.

## Development evidence

Retain previous plans and contracts in `docs/plans/` and `docs/contracts/`. Record evaluation input, output, source version, command, and limitations in `docs/evals/`. Use plain English. These records contain decisions and test evidence, not credentials, browser profiles, or raw conversations.
