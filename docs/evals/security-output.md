# Security evaluation output

Date: 2026-11-09. Review was independent source inspection of the files in [the input](security-input.md). It did not independently execute tests or inspect every browser/proxy combination.

## Findings and corrections

1. Medium: a native proxy or privacy contribution could remain hidden behind another extension. Disabling this extension only cleared a setting when it was the effective controller. Removing the other extension could then restore the stale contribution. Correction: native mode and disable call the browser's `clear()` API for this extension's contribution even when another extension masks it. The API preserves other extensions and the user's underlying setting. Regression tests check the proxy clear path and a privacy setting that remains effectively controlled by another extension.
2. Medium: an HTTPS subscription could follow redirects through HTTP before the final response URL was checked. Correction: subscription downloads use `redirect: "error"`. A regression test confirms the option and preserves cached rules when the request fails.

The reviewer reinspected both corrections and reported both findings resolved, with no remaining high/medium findings in those corrected paths. The integration owner ran the regression tests as part of the 36 passing unit tests. This is not a complete security certification.

## Other reviewed boundaries

The review included untrusted list and settings input, sender validation, CSS insertion, proxy selection and failover, native permission handling, settings rollback, DNS wire parsing, and no-telemetry claims. The release keeps known platform limits visible. Exact browser/API behavior remains subject to the integration matrix and the limitations in [acceptance output](acceptance-output.md).
