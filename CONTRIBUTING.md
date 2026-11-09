# Contributing

Use the mise-pinned Bun runtime and install dependencies with `mise exec -- bun install --frozen-lockfile`.

Before changing behavior, read [the repository guidance](AGENTS.md) and [runtime contract](CONTRACT.md). Follow the validation commands in the repository guidance. A release also needs the [release checks](skills/extension-release/SKILL.md).

After building, run `mise exec -- bun tools/native-parity.js` to compare the Firefox matcher with Chrome's real DNR `testMatchOutcome` on synthetic URL, priority, PSL and signed-URL cases. It uses an isolated profile and honors `CHROME_PATH`. CI runs this comparison before Chrome browser integration; it does not measure browser performance or prove equivalence for every possible rule.

- Keep UI labels, comments and docs in plain English. Comments should explain constraints or reasons the code cannot show.
- Preserve list validation, diagnostics, narrow permissions, local-only settings and the no-telemetry design. Treat all filter text as untrusted data.
- Before changing list snapshots, check their licenses and source revisions. Preserve provenance, original inputs and hashes.
- Update affected documentation and current verification evidence. Keep only useful current records; Git history holds superseded plans and snapshots.
- For documentation-only changes, check formatting and local links. For comment-only changes, also check syntax and confirm executable code is unchanged.

Public releases and store submissions require explicit authorization. GitHub packages are development builds; ordinary permanent Firefox installation requires Mozilla signing.
