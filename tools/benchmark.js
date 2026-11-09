import { mkdir, writeFile } from "node:fs/promises";
import { compileRules } from "../extension/core/rules.js";
import { DEFAULTS } from "../extension/core/settings.js";
import { createFirefoxFilter } from "../extension/core/firefox-filter.js";
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
const indexStart = performance.now();
const { evaluate } = createFirefoxFilter(result.rules);
const indexMs = performance.now() - indexStart;
const sampleDomains = result.rules
  .filter((rule) => rule.action.type === "block")
  .flatMap((rule) => rule.condition.requestDomains ?? [])
  .slice(0, 1000);
const requestTrials = [];
let matched = 0;
for (let n = 0; n < 11000; n++) {
  const request = {
    url: `https://${n % 2 ? sampleDomains[n % sampleDomains.length] : "unmatched-benchmark.invalid"}/resource`,
    type: "image",
    frameId: 0,
    originUrl: "https://benchmark.invalid/",
    documentUrl: "https://benchmark.invalid/",
  };
  const start = performance.now();
  const decision = evaluate(request);
  if (n >= 1000) {
    requestTrials.push(performance.now() - start);
    if (decision) matched++;
  }
}
requestTrials.sort((a, b) => a - b);
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
  firefox: {
    indexMs,
    requests: requestTrials.length,
    matched,
    medianRequestMs: requestTrials[Math.floor(requestTrials.length / 2)],
    p95RequestMs: requestTrials[Math.ceil(requestTrials.length * 0.95) - 1],
  },
  scope:
    "Compiler: one warm-up run; Firefox: one index build and 1000 warm-up requests followed by 10000 mixed matching/nonmatching image requests. Bun process only, no browser/network or Rust/WASM comparison. RSS covers the full process.",
  decision:
    "Chrome/Brave retain native DNR. Firefox uses indexed JavaScript matching for observable block decisions, with native DNR for headers/allowances. Reconsider Rust/WASM only after a measured browser runtime bottleneck. These results do not compare language performance.",
};
const directory = `docs/evals/${(await Bun.file("package.json").json()).version}`;
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/benchmark-output.json`,
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output, null, 2));
