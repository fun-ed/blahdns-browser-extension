# Evaluation input: release security review

Date: 2026-11-09. Scope: `extension/background.js`, settings, rule compiler, native privacy/proxy adapters, DNS wire parsing, settings UI, and generated manifests.

Check concrete trust boundaries: untrusted hosts/ABP/subscription text, message sender validation, CSS injection, proxy permission and failover, settings rollback, release of native browser settings, and absence of telemetry. Report actionable medium or high findings with source evidence and a minimal correction. Do not run code or infer a pass from static inspection. Review the corrected paths again before closing findings.
