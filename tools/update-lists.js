import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeHost } from "../extension/core/settings.js";

const entries = [
  {
    name: "ads",
    repo: "hagezi/dns-blocklists",
    branch: "main",
    path: "wildcard/light-onlydomains.txt",
    license: "GPL-3.0-only",
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
for (const entry of entries) {
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
  const revision = (await new Response(command.stdout).text()).trim();
  if ((await command.exited) || !/^[a-f0-9]{40}$/.test(revision))
    throw new Error("Cannot resolve list revision.");
  const url = `https://raw.githubusercontent.com/${entry.repo}/${revision}/${entry.path}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Cannot download ${entry.name}: ${response.status}`);
  const input = await response.text();
  const domains = new Set(),
    skipped = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    try {
      const host = normalizeHost(line);
      if (!host.includes("."))
        throw new Error("List entries must contain a domain suffix.");
      domains.add(host);
    } catch {
      skipped.push(raw);
    }
  }
  if (domains.size < 1000)
    throw new Error(`Unexpectedly small ${entry.name} list. Review upstream.`);
  const output = `# Derived from ${entry.repo} at ${revision}\n# License: ${entry.license}. See NOTICE.md.\n${[...domains].sort().join("\n")}\n`;
  await writeFile(`data/upstream/${entry.name}.txt`, input);
  await writeFile(`extension/lists/${entry.name}.txt`, output);
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  metadata.push({
    ...entry,
    revision,
    url,
    retrievedAt: new Date().toISOString(),
    inputSha256: hash(input),
    outputSha256: hash(output),
    domains: domains.size,
    skipped,
  });
}
await writeFile(
  "extension/lists/sources.json",
  JSON.stringify(metadata, null, 2) + "\n",
);
const license = await fetch(
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/LICENSE",
);
if (!license.ok) throw new Error("Cannot fetch GPL license.");
await writeFile("LICENSE", await license.text());
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
