# Firefox proxy event-page lifecycle

Firefox wake listeners must be registered synchronously during background startup. Registering `proxy.onRequest` after `permissions.contains()` can miss persistent registration. Guard access to the proxy namespace because its permission is optional.

Sources: [MDN background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts), [proxy.onRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest), and [Gecko proxy permission schema](https://github.com/mozilla/gecko-dev/blob/master/toolkit/components/extensions/schemas/proxy.json).

## Verified recovery

The retained [0.2.2/0.2.3 comparison](evals/0.2.4/firefox-wake-filter-comparison.json) uses Firefox Developer Edition 160 and disposable profiles. Both versions observe a stopped background after `about:crashextensions`. The first selected HTTP request fails with `NS_ERROR_UNKNOWN_HOST` in 0.2.2; in 0.2.3 it receives the local proxy response and restarts the background. Current-release recovery is checked separately in the [verification record](evals/0.2.4/acceptance-output.md).

The [test](../tools/firefox-wake-test.js) pre-grants proxy access, adds a script-free observation view and restricts listener filters to `http://wake-fixture.invalid/*` so unrelated browser traffic cannot wake it early. The copied 0.2.2 runner changes the expected registration-site count from two to one and uses the older package version; runtime assertions remain unchanged. The release filter is `<all_urls>`.

This verifies forced crash recovery on the tested build. Natural idle shutdown, native permission dialogs and other Firefox versions remain unverified. The crash trigger can abort its own navigation; the stopped-background assertion establishes the precondition.
