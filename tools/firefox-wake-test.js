import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const version = (await Bun.file("package.json").json()).version;
const temp = await mkdtemp(join(tmpdir(), "blahdns-firefox-wake-"));
const server = createServer((_request, response) =>
  response.end("wake-proxy-fixture"),
);
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const result = {
  version,
  status: "failed",
  scope:
    "Forced extension-process crash recovery in a disposable profile; natural idle is not covered.",
};
let browser;
try {
  const extension = join(temp, "extension");
  await cp("dist/firefox", extension, { recursive: true });
  const manifest = await Bun.file(join(extension, "manifest.json")).json();
  assert.equal(manifest.version, version);
  // Grant proxy only in this isolated fixture and add a script-free observation view.
  manifest.permissions.push("proxy");
  manifest.optional_permissions = [];
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
  // Browser background traffic must not wake the fixture before the selected request.
  const backgroundPath = join(extension, "background.js");
  const background = await Bun.file(backgroundPath).text();
  assert.equal(background.split('urls: ["<all_urls>"]').length - 1, 2);
  await writeFile(
    backgroundPath,
    background.replaceAll(
      'urls: ["<all_urls>"]',
      'urls: ["http://wake-fixture.invalid/*"]',
    ),
  );
  await writeFile(
    join(extension, "ui/wake-probe.html"),
    "<!doctype html><title>Isolated lifecycle probe</title>",
  );
  browser = await puppeteer.launch({
    browser: "firefox",
    executablePath:
      process.env.FIREFOX_PATH ??
      "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
    headless: true,
    userDataDir: join(temp, "profile"),
    protocolTimeout: 15000,
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
    extraPrefsFirefox: {
      "network.proxy.type": 0,
      "extensions.webextensions.warnings-as-errors": false,
      "extensions.webextensions.uuids": JSON.stringify({
        "browser-extension@blahdns.com": "7d8dd33f-49e7-479e-a85b-283a03d2b42b",
      }),
    },
  });
  result.browser = await browser.version();
  await browser.installExtension(resolve(extension));
  const prefix = "moz-extension://7d8dd33f-49e7-479e-a85b-283a03d2b42b/ui/";
  const options = await browser.newPage();
  await options
    .mainFrame()
    .browsingContext.navigate(prefix + "options.html", "complete");
  const state = await options.evaluate(() =>
    browser.runtime.sendMessage({ type: "getState" }),
  );
  assert(state.ok, state.error);
  const settings = {
    ...state.settings,
    adblock: false,
    contentFarms: false,
    proxy: {
      ...state.settings.proxy,
      enabled: true,
      type: "http",
      host: "127.0.0.1",
      port: server.address().port,
      mode: "sites",
      sites: ["wake-fixture.invalid"],
    },
  };
  const saved = await options.evaluate(
    (settings) =>
      browser.runtime.sendMessage({ type: "saveSettings", settings }),
    settings,
  );
  assert(saved.ok, saved.error);
  const before = await browser.newPage();
  await before
    .mainFrame()
    .browsingContext.navigate(prefix + "wake-probe.html", "complete");
  assert(await before.evaluate(() => !!browser.extension.getBackgroundPage()));
  const crash = await browser.newPage();
  try {
    await crash
      .mainFrame()
      .browsingContext.navigate("about:crashextensions", "complete");
  } catch (error) {
    // The crash trigger can abort its own navigation; the stopped-page assertion is authoritative.
    result.crashNavigationError = error.message;
  }
  const after = await browser.newPage();
  await after
    .mainFrame()
    .browsingContext.navigate(prefix + "wake-probe.html", "complete");
  result.backgroundBeforeRequest = await after.evaluate(
    () => !!browser.extension.getBackgroundPage(),
  );
  assert.equal(
    result.backgroundBeforeRequest,
    false,
    "Probe must observe a stopped background without waking it",
  );
  const request = await browser.newPage();
  request.setDefaultNavigationTimeout(10000);
  await request.goto("http://wake-fixture.invalid/probe");
  assert.equal(
    await request.$eval("body", (element) => element.textContent.trim()),
    "wake-proxy-fixture",
  );
  result.backgroundAfterRequest = await after.evaluate(
    () => !!browser.extension.getBackgroundPage(),
  );
  assert.equal(result.backgroundAfterRequest, true);
  result.status = "passed";
} catch (error) {
  result.error = error.message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  server.close();
  await rm(temp, { recursive: true, force: true });
}
await mkdir("artifacts", { recursive: true });
await Bun.write(
  "artifacts/firefox-wake-results.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
