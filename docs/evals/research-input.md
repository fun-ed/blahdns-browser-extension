# Research input

## Purpose

Source review date: 2026-11-09.

Choose a maintainable privacy-extension architecture for a lightweight Manifest V3 browser extension and define claims that can be supported by browser and project sources.

## Questions

1. Compare Brave `adblock-rust`, AdGuard's MV3 extension, uBlock Origin, and uBlock Origin Lite for rule parsing, runtime architecture, DNR limits, and features that do not map to DNR.
2. Decide whether Rust/WASM belongs in the extension runtime or only in an offline build-time evaluation. Keep Node-based evaluation build-time only; use the repository's Bun toolchain for project commands.
3. Compare injected JavaScript fingerprint noise with native Firefox and Brave protections, and document Chrome extension limits.
4. Review Cloudflare's own challenge guidance. Separate compatibility risks from unsupported CAPTCHA-bypass claims.
5. Document proxy protocol selection and destination-domain scope, including browser-controlled HTTP/2, HTTP/3, and QUIC behavior.
6. Clarify that the SG/DE DoH URLs are manually configured in browser settings and that the extension test is a diagnostic, not DNS control.
7. Use Reddit, Medium, and store pages only when a concrete source can be verified; label commentary and publisher disclosures appropriately.

## Evidence rules

Prefer browser-vendor, project-maintainer, API, and service-owner sources for technical facts. Cite the source beside each major claim. Treat community posts and Medium articles as anecdotes, not measurements or platform guarantees. State where sources could not be read or do not establish a claim.

## Required output

Record concise facts, decisions, and limitations in `docs/evals/research-output.md`. Do not copy raw transcripts, secrets, or unsourced performance results.

## Status

Research notes are recorded; local implementation and release verification remain pending.
