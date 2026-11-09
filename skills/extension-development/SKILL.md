---
name: extension-development
description: Use when changing this repository's extension behavior, lists, permissions, settings or implementation docs.
---

# Extension development

1. Read `AGENTS.md`, `CONTRACT.md` and the affected code.
2. Preserve validation, unsupported-rule diagnostics and module boundaries. Review privacy, permission and compatibility effects with the change.
3. Update affected contracts and docs. Keep useful current verification evidence, without creating plan snapshots or intermediate-run archives.
4. Run the applicable gates in `AGENTS.md`. Record actual results and unavailable checks.
5. For publication, follow `skills/extension-release/SKILL.md`.
