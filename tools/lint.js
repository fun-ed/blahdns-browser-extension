import { readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const transpiler = new Bun.Transpiler({ loader: "js", target: "browser" });
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
let count = 0;
const fail = (file, message) => {
  throw new Error(`${file}: ${message}`);
};
for (const dir of ["extension", "tools", "tests"]) {
  for (const file of await walk(dir)) {
    if (file.endsWith(".js")) {
      const code = await Bun.file(file).text();
      const scan = transpiler.scan(code);
      for (const item of scan.imports) {
        if (
          item.path.startsWith(".") &&
          !(await Bun.file(resolve(dirname(file), item.path)).exists())
        )
          fail(file, `missing import ${item.path}`);
      }
      if (file.startsWith("extension/")) {
        if (
          /\beval\s*\(|new\s+Function\s*\(|\.innerHTML\s*=|document\.write\s*\(/.test(
            code,
          )
        )
          fail(file, "unsafe dynamic code or HTML injection");
        if (
          /\b(?:process|Bun)\./.test(code) ||
          /from\s+['"](?:node:|https?:)/.test(code)
        )
          fail(file, "runtime requires a non-browser API");
        if (/\bconsole\.(?:log|debug|info)\s*\(/.test(code))
          fail(file, "runtime logging can expose browsing data");
      }
      count++;
    }
    if (file.endsWith(".html")) {
      const html = await Bun.file(file).text();
      if (/\son[a-z]+\s*=|javascript:/i.test(html))
        fail(file, "inline event handler");
      for (const tag of html.matchAll(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      )) {
        if (
          tag[2].trim() ||
          !/\bsrc=["'][^"']+["']/.test(tag[1]) ||
          /https?:|data:/i.test(tag[1])
        )
          fail(file, "script must use a local file");
      }
      count++;
    }
  }
}
const pkg = await Bun.file("package.json").json();
if (pkg.dependencies && Object.keys(pkg.dependencies).length)
  fail("package.json", "runtime dependencies must stay empty");
if (
  Object.keys(pkg.devDependencies ?? {}).some((name) =>
    /eslint|prettier|biome|oxlint/.test(name),
  )
)
  fail("package.json", "use Bun native tools");
for (const command of Object.values(pkg.scripts))
  if (!command.startsWith("mise exec -- "))
    fail("package.json", "all scripts must use mise exec --");
console.log(
  `Bun lint passed: ${count} source files. Checks: syntax, local imports, browser boundaries, CSP markup, and package policy. This is not a full style or type linter.`,
);
