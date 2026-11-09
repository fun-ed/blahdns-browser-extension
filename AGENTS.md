# Repository guidance

## Read before changing behavior

- Read `CONTRACT.md` and `plan.md` before changing settings, messages, filtering behavior, browser APIs, permissions, manifests, or build outputs.
- `extension/core/settings.js` owns settings validation and domain matching. `extension/core/rules.js` owns list parsing, supported syntax, diagnostics, and DNR compilation. `extension/background.js` connects storage, rules, privacy, proxy, DNS diagnostics, and counters.
- Treat `data/upstream/`, `extension/lists/`, custom rules, and HTTPS subscriptions as untrusted text. Validate domains and modifiers, report unsupported input, and never execute list content.
- Keep scope, privacy, permissions, and user-facing claims aligned. Ask for explicit user authorization before adding telemetry, remote code, broader data collection, new permissions, external publication, or store submission.
- Preserve `docs/evals/research-input.md` and `docs/evals/research-output.md` as structured source notes. Add facts, decisions, and limitations; do not store raw transcripts or secrets.

## Required gates

Before a behavior change is complete, account for its scope and interfaces, privacy impact, permissions, and the no-telemetry design. Use the mise-pinned Bun 1.4.4; `bun fmt --check` is built in, and `bun lint` is repository-owned. Run the repository gates through mise:

```sh
mise exec -- bun fmt --check
mise exec -- bun lint
mise exec -- bun test
mise exec -- bun run build
mise exec -- bun run check
mise exec -- bun run test:browser
mise exec -- bun run benchmark
```

Release readiness also requires real integration checks in Chrome, Brave, and Firefox, plus review of the release artifacts, SHA-256 checksums, and exact source revision. Mark each gate **pending**, **passed**, or **blocked** with evidence. Never report a pass without actually running the check; name unavailable or blocked checks plainly.
