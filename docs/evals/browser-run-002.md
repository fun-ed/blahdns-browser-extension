# Browser run 002

Date: 2026-11-09. Command: `mise exec -- bun run test:browser`, after rebuilding the split URL-cleaning rules.

Result: the outer command timed out after 300 seconds. Captured output included a Brave `Browser.getVersion` protocol timeout. This run did not produce a reliable final browser matrix and is not counted as passed.

The harness then gained bounded protocol, navigation, and cleanup deadlines with stage output. An orphaned Firefox process from the isolated test profile was terminated. Subsequent focused runs separated the Firefox BiDi navigation restriction from actual extension behavior. Final results are in [browser-output.json](browser-output.json).
