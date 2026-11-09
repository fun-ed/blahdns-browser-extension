import { mkdir, writeFile } from "node:fs/promises";
import { compileRules } from "../extension/core/rules.js";
import { DEFAULTS } from "../extension/core/settings.js";
const inputs = await Promise.all(
  ["ads", "farms"].map(async (name) => ({
    name,
    text: await Bun.file(`extension/lists/${name}.txt`).text(),
  })),
);
const trials = [];
let result;
for (let n = 0; n < 21; n++) {
  const start = performance.now();
  result = compileRules(structuredClone(DEFAULTS), inputs);
  if (n) trials.push(performance.now() - start);
}
trials.sort((a, b) => a - b);
const output = {
  date: new Date().toISOString(),
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform}/${process.arch}`,
  inputBytes: inputs.reduce((n, s) => n + Buffer.byteLength(s.text), 0),
  domains: result.report.domains,
  dnrRules: result.rules.length,
  dnrJsonBytes: Buffer.byteLength(JSON.stringify(result.rules)),
  iterations: trials.length,
  medianMs: trials[Math.floor(trials.length / 2)],
  p95Ms: trials[Math.ceil(trials.length * 0.95) - 1],
  rssBytes: process.memoryUsage().rss,
  scope:
    "Compiler only. One warm-up run. No browser/network or Rust/WASM comparison. RSS covers the full Bun process.",
  decision:
    "Use native browser DNR for request matching. Keep JavaScript for bounded compilation. Bun owns development tooling. Reconsider Rust/WASM only after a measured runtime bottleneck. These results do not compare language performance.",
};
const directory = `docs/evals/${(await Bun.file("package.json").json()).version}`;
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/benchmark-output.json`,
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output, null, 2));
