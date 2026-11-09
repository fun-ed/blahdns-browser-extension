# Integration contract

All files under this new repo. Runtime is dependency-free JS ES modules, global `browser ?? chrome`. Never log browsing URLs or settings. Build copies `extension/` into `dist/chromium` and `dist/firefox`, creates target manifests. Browser minimum Chrome 121, Firefox 140.

## Settings schema (exact)

```js
{version:1,enabled:true,mode:'global',sites:[],exceptions:[],adblock:true,contentFarms:true,cleanUrls:true,customRules:'',subscriptions:[],statsEnabled:false,dnsRegion:'sg',privacy:{webrtc:'native',fingerprinting:'native',language:'native',userAgent:''},proxy:{enabled:false,type:'http',host:'127.0.0.1',port:8080,mode:'global',sites:[],bypass:[]}}
```

`mode`: global or sites; domain strings exact hostname, `*.example.com` matches subdomains only. Exceptions disable filtering/header modifications for that site. Proxy separate scope based on destination hostname, not tab hostname; paused filtering does not bypass proxy. `subscriptions`: `{url:string,text:string,updatedAt:string}`; all HTTPS, 2MB each/4MB total. `webrtc`: native/public/proxy; fingerprinting native/resist (Firefox native RFP only), language native/en-US (HTTP header only). userAgent string HTTP header only advanced setting, no JS spoof claims. statistics local opt-in counters, never history.

## UI runtime messages

`chrome.runtime.sendMessage()` or `browser.runtime.sendMessage()` resolves `{ok:true,...}` or `{ok:false,error}`. `getState` and `saveSettings` (`settings` key) return `{ok,settings,report,stats,capabilities,privacyStatus,proxyStatus}`. `previewRules` (`settings`) returns `{ok,report}`. `testDns` (`region`) returns `{ok,result}`. `updateSubscriptions` updates all current HTTPS subscriptions then recompiles atomically and returns state. `resetStats` returns state. `setSite` (`domain`, `paused` boolean) adds/removes exact domain from exceptions. `getPolicy` for content scripts derives URL from sender, returns `{ok,active,cleanUrls,selectors:[],exceptions:[]}`. Capability keys `{firefox,proxyPermission,rfp,dnrFeedback}`. report `{rules,domains,cosmetic,unsupported:[{line,reason,source}],ignored,accepted}`; cap diagnostics shown without HTML interpolation. stats `{cleanedLinks,cosmeticPages,blockedRequests}`. blockedRequests only from actual DNR debug event (unpacked); unavailable production means null, never fake blocked count.

## Network module interfaces (agent owns)

`extension/core/proxy.js`: pure exports `validateProxy(proxy) -> canonical proxy`, `createPac(proxy)->string`, `routeProxy(proxy,url)->ProxyInfo[]|undefined` (Firefox), async `applyProxy(api,proxy)->status` supports Chromium proxy.settings and permission gates; Firefox handler registered in background uses `routeProxy` with storage-resolved config, fail-closed `[proxyInfo,null]`, no direct fallback for selected destinations. Pure host helpers import `normalizePattern`, `matchesPattern` from `./settings.js`. `applyProxy` Firefox returns status, browser.proxy.onRequest listener owned by background. `proxy` optional API permission requested by UI before save enabled, no credentials stored.
`extension/core/privacy.js`: async `applyPrivacy(api,settings.privacy,enabled)->{...status}` uses browser native privacy controls, checks levelOfControl and reads back values. native clears only settings controlled_by_this_extension. webrtc public=default_public_interface_only, proxy=disable_non_proxied_udp. Firefox RFP opt-in global. Chromium RFP unsupported throws if requested. No script fingerprint hooks.
`extension/core/dns.js`: `ENDPOINTS` object sg/de; async `testDns(region)->{endpoint,rcode,answers,latencyMs,message}` RFC8484 POST fixed example.com A DNS query credentials omit, abort timeout, validate MIME, DNS response header/opcode/id/question/bounds, no browser DNS claims.
Agent writes matching Node tests in `tests/network.test.js`. No tests/builds mid-flight.

## Ownership

Primary: settings/rules/cleaner, background/content, manifests/build/e2e, lists, docs.
UI agent: extension/ui/* only, tests/ui.test.js optional. Use ../../ root tokens? copy supplied root tokens.css/base.css to extension/ui via write; avoid editing root. UI no inline script/event/innerHTML; all script local. All settings errors via role=status; input validation backend authoritative. Tests/builds only integration owner afterward.
Network agent: core/proxy.js, privacy.js, dns.js and tests/network.test.js only.
