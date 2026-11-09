# Repository guidance

Before changing settings, messages, filtering, browser APIs, permissions, manifests or build outputs, read `CONTRACT.md` and the affected code.

- Treat bundled, custom and subscribed filter lists as untrusted text. Validate input, report unsupported syntax and never execute list content.
- Preserve local-only storage and the no-telemetry design. New permissions, broader collection, remote code, external publication and store submission require explicit user authorization.
- Update affected docs and useful current evidence in `docs/evals/<version>/`. Superseded plans, contracts and intermediate runs belong in Git history. Keep secrets, browser profiles and raw transcripts out of records.

## Verification

Use the mise-pinned Bun runtime. Before completing a behavior change, run:

```sh
mise exec -- bun fmt --check
mise exec -- bun lint
mise exec -- bun test
mise exec -- bun run build
mise exec -- bun run check
mise exec -- bun run test:browser
mise exec -- bun run benchmark
```

`bun fmt` is built in; lint checks syntax, imports, CSP and package policy. Documentation-only changes need formatting and link checks. Comment-only changes also need syntax checks and confirmation that executable code is unchanged.

For releases, follow `skills/extension-release/SKILL.md`. Report gates as passed, pending or blocked using actual evidence.
