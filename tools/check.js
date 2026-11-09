import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DEFAULTS } from "../extension/core/settings.js";
import { compileRules, parseList } from "../extension/core/rules.js";
const sources = await Bun.file("extension/lists/sources.json").json();
const lists = [];
for (const source of sources) {
  const text = await Bun.file(`extension/lists/${source.name}.txt`).text();
  assert.equal(
    createHash("sha256").update(text).digest("hex"),
    source.outputSha256,
    `${source.name} output checksum`,
  );
  const original = await Bun.file(`data/upstream/${source.name}.txt`).text();
  assert.equal(
    createHash("sha256").update(original).digest("hex"),
    source.inputSha256,
    `${source.name} original checksum`,
  );
  if (source.format === "abp")
    assert.equal(text, original, "ABP source must be preserved unchanged");
  else
    assert.equal(
      parseList(text).network.length,
      0,
      `${source.name} must contain only domain rules`,
    );
  lists.push({ name: source.name, text });
}
const compiled = compileRules(structuredClone(DEFAULTS), lists);
assert.equal(
  compiled.report.unsupported.length,
  0,
  "bundled normalized domains must compile without omissions",
);
assert(compiled.report.domains > 1000);
for (const target of ["chromium", "firefox"]) {
  const manifest = await Bun.file(`dist/${target}/manifest.json`).json();
  assert.equal(manifest.manifest_version, 3);
  assert.equal(
    manifest.version,
    (await Bun.file("package.json").json()).version,
  );
  assert.deepEqual(manifest.optional_permissions, ["proxy"]);
  assert(!manifest.permissions.includes("proxy"));
  assert.equal(
    manifest.permissions.includes("webRequest"),
    target === "firefox",
  );
  assert.equal(
    manifest.permissions.includes("webRequestBlocking"),
    target === "firefox",
  );
  assert.equal(
    manifest.permissions.includes("declarativeNetRequestFeedback"),
    target === "chromium",
  );
  assert.equal(manifest.incognito, "not_allowed");
  assert(
    !manifest.externally_connectable && !manifest.web_accessible_resources,
  );
  assert(
    !manifest.content_security_policy.extension_pages.includes("unsafe-eval"),
  );
  assert(await Bun.file(`dist/${target}/LICENSE`).exists());
  assert(await Bun.file(`dist/${target}/NOTICE.md`).exists());
  const paths = [
    "content.js",
    "background.js",
    manifest.options_ui.page,
    manifest.action.default_popup,
  ];
  for (const path of paths)
    assert(await Bun.file(`dist/${target}/${path}`).exists(), path);
}
const build = await Bun.file("artifacts/build.json").json();
assert.deepEqual(
  build.outputs.map((output) => output.path.split(".").at(-1)),
  ["zip", "zip", "xpi"],
);
assert.equal(
  build.outputs[1].sha256,
  build.outputs[2].sha256,
  "Firefox XPI must be byte-identical to Firefox ZIP",
);
for (const output of build.outputs) {
  assert.equal(
    new Bun.CryptoHasher("sha256")
      .update(await Bun.file(output.path).arrayBuffer())
      .digest("hex"),
    output.sha256,
  );
  const check = Bun.spawn(["unzip", "-t", output.path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (await check.exited)
    throw new Error(await new Response(check.stderr).text());
}
console.log(
  `Package checks passed. ${compiled.report.domains} distinct domains in ${compiled.report.rules} DNR rules. ZIP/XPI archives and source hashes match.`,
);
