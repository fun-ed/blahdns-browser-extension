# 0.2.3 acceptance input

Goal: correct native apply/release reporting, preserve settings and rules when release fails, clarify optional proxy permission status and persist Firefox event-page proxy wake listeners.

Expected behavior:

- An acknowledged proxy set with a different PAC is not reported applied.
- An acknowledged but ineffective privacy/proxy clear cannot persist native/off or master-off settings; previous settings and DNR rules are restored.
- Unmodified Chrome/Brave first install explains missing optional proxy access.
- Firefox startup registers its proxy listener before asynchronous permission queries. After a forced extension-process crash in a disposable profile, the first selected request wakes the background and uses the local HTTP proxy.
- Existing CSS rejection, real filtering, scope, themes, import/export, counters, native controls, default-list cache, HTTP/SOCKS5 routing and no-write status queries remain passing.

Run every AGENTS gate through mise, verify repeat ZIP/XPI bytes and independently check exact-source CI and downloaded release assets. No natural-idle, native permission-dialog, minimum-version, store-signing, full transport or CAPTCHA claim.
