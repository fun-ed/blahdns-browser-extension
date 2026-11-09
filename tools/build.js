import { cp, mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const pkg = await Bun.file("package.json").json();
const epoch = new Date("2000-01-01T00:00:00Z");
export async function filesIn(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else files.push(path);
  }
  return files.sort();
}
await mkdir("artifacts", { recursive: true });
const outputs = [];
for (const target of ["chromium", "firefox"]) {
  const out = `dist/${target}`;
  await rm(out, { recursive: true, force: true });
  await cp("extension", out, { recursive: true });
  await cp("LICENSE", `${out}/LICENSE`);
  await cp("NOTICE.md", `${out}/NOTICE.md`);
  const result = await Bun.build({
    entrypoints: ["extension/content.js"],
    target: "browser",
    format: "iife",
    minify: false,
    write: false,
  });
  if (!result.success)
    throw new AggregateError(result.logs, "Content script build failed.");
  await writeFile(`${out}/content.js`, await result.outputs[0].text());
  const manifest = {
    manifest_version: 3,
    name: "BlahDNS Browser Extension",
    version: pkg.version,
    description:
      "Local ad and tracker blocking, clean links, privacy controls, and scoped proxy routing.",
    homepage_url: "https://github.com/fun-ed/blahdns-browser-extension",
    permissions: [
      "storage",
      "privacy",
      "scripting",
      "declarativeNetRequest",
      "declarativeNetRequestFeedback",
    ],
    optional_permissions: ["proxy"],
    host_permissions: ["<all_urls>"],
    action: { default_popup: "ui/popup.html", default_title: "BlahDNS" },
    options_ui: { page: "ui/options.html", open_in_tab: true },
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["content.js"],
        run_at: "document_start",
        all_frames: true,
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'",
    },
    incognito: "not_allowed",
    background:
      target === "firefox"
        ? { scripts: ["background.js"], type: "module" }
        : { service_worker: "background.js", type: "module" },
  };
  if (target === "chromium") manifest.minimum_chrome_version = "121";
  else
    manifest.browser_specific_settings = {
      gecko: {
        id: "browser-extension@blahdns.com",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  await writeFile(
    `${out}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const files = await filesIn(out);
  for (const file of files) await utimes(file, epoch, epoch);
  const archive = `artifacts/blahdns-${target}-${pkg.version}.zip`;
  await rm(archive, { force: true });
  const zip = Bun.spawn(["zip", "-X", "-q", resolve(archive), "-@"], {
    cwd: out,
    stdin: "pipe",
    stdout: "inherit",
    stderr: "inherit",
  });
  zip.stdin.write(files.map((f) => f.slice(out.length + 1)).join("\n") + "\n");
  zip.stdin.end();
  if (await zip.exited) throw new Error(`Cannot package ${target}.`);
  const bytes = await Bun.file(archive).arrayBuffer();
  outputs.push({
    target,
    path: archive,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
  });
}
await writeFile(
  "artifacts/SHA256SUMS",
  outputs.map((o) => `${o.sha256}  ${o.path.split("/").pop()}`).join("\n") +
    "\n",
);
await writeFile(
  "artifacts/build.json",
  JSON.stringify({ version: pkg.version, bun: Bun.version, outputs }, null, 2) +
    "\n",
);
console.log(JSON.stringify(outputs, null, 2));
