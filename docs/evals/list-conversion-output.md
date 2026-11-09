# Evaluation output: initial list conversion

Date: 2026-11-09. Inputs: pinned upstream revisions in `extension/lists/sources.json` and original bytes in `data/upstream/`.

The first conversion produced 88,382 ad/tracker entries and 12,250 content-farm entries. It recorded 3,348 unsupported farm entries. Inspection of the compiled rules found one UUID-shaped single-label marker in the farm input. It had passed host validation but was not a public domain. The parser would have treated it as an unanchored ABP URL filter.

Correction: the upstream domain converter now requires a domain suffix. That marker is recorded as omitted. This preserves the original input and prevents a broad URL substring rule. Re-run the compiler benchmark after this correction. The current metadata and acceptance output, not the initial counts here, define the release input.
