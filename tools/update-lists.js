import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  normalizeHost,
  DEFAULT_ADBLOCK_URL,
  DEFAULT_ADBLOCK_MAX_BYTES,
} from "../extension/core/settings.js";
import { parseList } from "../extension/core/rules.js";

const entries = [
  {
    name: "ads",
    url: DEFAULT_ADBLOCK_URL,
    format: "abp",
    license: "Upstream component licenses apply; see NOTICE.md",
  },
  {
    name: "farms",
    repo: "danny0838/content-farm-terminator",
    branch: "gh-pages",
    path: "src/blocklist/content-farms.txt",
    license: "GPL-3.0-only",
  },
];
const metadata = [];
await mkdir("data/upstream", { recursive: true });
await mkdir("extension/lists", { recursive: true });
const hash = (text) => createHash("sha256").update(text).digest("hex");
for (const entry of entries) {
  let revision,
    url = entry.url;
  if (!url) {
    const command = Bun.spawn(
      [
        "gh",
        "api",
        `repos/${entry.repo}/commits/${entry.branch}`,
        "--jq",
        ".sha",
      ],
      { stdout: "pipe", stderr: "inherit" },
    );
    revision = (await new Response(command.stdout).text()).trim();
    if ((await command.exited) || !/^[a-f0-9]{40}$/.test(revision))
      throw new Error("Cannot resolve list revision.");
    url = `https://raw.githubusercontent.com/${entry.repo}/${revision}/${entry.path}`;
  }
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Cannot download ${entry.name}: ${response.status}`);
  const input = await response.text();
  let output,
    domains,
    networkRules = 0;
  const skipped = [];
  if (entry.format === "abp") {
    if (new TextEncoder().encode(input).length > DEFAULT_ADBLOCK_MAX_BYTES)
      throw new Error("Default ABP source exceeds 4 MB.");
    const parsed = parseList(input, entry.name);
    if (parsed.accepted < 1000 || parsed.unsupported.length)
      throw new Error(
        "Default ABP source is unexpectedly small or contains unsupported syntax.",
      );
    output = input;
    domains = parsed.domains.length;
    networkRules = parsed.network.length;
  } else {
    const normalized = new Set();
    for (const raw of input.split(/\r?\n/)) {
      const line = raw.replace(/\s+#.*$/, "").trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      try {
        const host = normalizeHost(line);
        if (!host.includes("."))
          throw new Error("List entries must contain a domain suffix.");
        normalized.add(host);
      } catch {
        skipped.push(raw);
      }
    }
    domains = normalized.size;
    output = `# Derived from ${entry.repo} at ${revision}\n# License: ${entry.license}. See NOTICE.md.\n${[...normalized].sort().join("\n")}\n`;
  }
  if (domains < 1000)
    throw new Error(`Unexpectedly small ${entry.name} list. Review upstream.`);
  revision ??= hash(input);
  await writeFile(`data/upstream/${entry.name}.txt`, input);
  await writeFile(`extension/lists/${entry.name}.txt`, output);
  metadata.push({
    ...entry,
    revision,
    url,
    retrievedAt: new Date().toISOString(),
    inputSha256: hash(input),
    outputSha256: hash(output),
    domains,
    networkRules,
    skipped,
  });
}
await writeFile(
  "extension/lists/sources.json",
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    metadata.map(({ name, domains, skipped, revision }) => ({
      name,
      domains,
      skipped: skipped.length,
      revision,
    })),
    null,
    2,
  ),
);
