---
name: extension-development
description: Use when changing this repository's extension behavior, filter lists, browser permissions, settings, or implementation docs.
---

# Extension development

1. Read `AGENTS.md`, `CONTRACT.md`, `plan.md`, and the files for the behavior being changed.
2. Keep the change inside the existing module and message contracts. `settings.js` validates settings and host patterns; `rules.js` parses untrusted filter text and compiles DNR; `background.js` connects browser APIs and storage.
3. Treat bundled, custom, and subscribed lists as untrusted data. Preserve validation and report unsupported syntax. Keep UI and comments in plain English.
4. Review privacy and permissions with the change. Preserve local-only settings, no telemetry, no browsing history, header-only language/User-Agent controls, and no JavaScript fingerprint spoofing. Ask for user authorization before adding remote code, telemetry, wider collection, new permissions, or external publication.
5. Update the directly affected docs, roadmap, and structured eval notes. Keep verification status pending until the integration owner records actual evidence.
6. Use the mise-pinned Bun 1.4.4 and its built-in `bun fmt --check`; `bun lint` is the repository's own check. Run the relevant checks through mise, and run the complete gate set before calling a change ready:

   ```sh
   mise exec -- bun fmt --check
   mise exec -- bun lint
   mise exec -- bun test
   mise exec -- bun run build
   mise exec -- bun run check
   mise exec -- bun run test:browser
   mise exec -- bun run benchmark
   ```

7. For release readiness, require real Chrome, Brave, and Firefox integration, generated artifact and permission review, and SHA-256 plus source revision for each package. Mark unavailable checks blocked; never report unrun checks as passed.
