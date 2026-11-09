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
const extensionId = "browser-extension@blahdns.com";
const extensionUuid = "7d8dd33f-49e7-479e-a85b-283a03d2b42b";
const extensionUrl = `moz-extension://${extensionUuid}/ui/`;
const fixturePattern = 'urls: ["http://wake-fixture.invalid/*"]';
const result = {
  version,
  status: "failed",
  scope:
    "Forced extension-process crash recovery in disposable profiles; natural idle is not covered.",
  proxy: { status: "failed" },
  blocking: { status: "failed" },
};

function replaceExactly(source, search, replacement, label) {
  assert.equal(
    source.split(search).length - 1,
    1,
    `Expected one ${label} in the test copy`,
  );
  return source.replace(search, replacement);
}

function curateBackground(source, mode) {
  const allUrls = 'urls: ["<all_urls>"]';
  assert.equal(
    source.split(allUrls).length - 1,
    3,
    "Expected two proxy and one webRequest all-URL registrations",
  );
  let background = source.replaceAll(allUrls, fixturePattern);
  background = replaceExactly(
    background,
    "api.tabs.onUpdated.addListener(",
    "if (false) api.tabs.onUpdated.addListener(",
    "tabs.onUpdated registration",
  );
  background = replaceExactly(
    background,
    "api.tabs.onRemoved.addListener(",
    "if (false) api.tabs.onRemoved.addListener(",
    "tabs.onRemoved registration",
  );
  if (mode === "proxy") {
    background = replaceExactly(
      background,
      "api.webRequest.onBeforeRequest.addListener(",
      "if (false) api.webRequest.onBeforeRequest.addListener(",
      "webRequest registration",
    );
  } else {
    background = replaceExactly(
      background,
      "if (firefox && api.proxy?.onRequest) {",
      "if (false) {",
      "initial proxy registration",
    );
    background = replaceExactly(
      background,
      "async function registerProxyListener() {",
      "async function registerProxyListener() { return;",
      "dynamic proxy registration",
    );
  }
  return background;
}

async function readState(options) {
  const state = await options.evaluate(() =>
    browser.runtime.sendMessage({ type: "getState" }),
  );
  assert(state.ok, state.error);
  return state;
}

async function readActivity(page, tabId) {
  return page.evaluate(async (key) => {
    const stored = await browser.storage.session.get(key);
    return stored[key] ?? null;
  }, `tabActivity:${tabId}`);
}

async function waitFor(label, read, matches, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (matches(value)) return value;
    await new Promise((done) => setTimeout(done, 100));
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out; last value: ${JSON.stringify(value)}`);
}

async function extensionPage(browser, url) {
  const page = await browser.newPage();
  await page.mainFrame().browsingContext.navigate(url, "complete");
  return page;
}

async function crashExtension(browser, run) {
  const crash = await browser.newPage();
  try {
    await crash
      .mainFrame()
      .browsingContext.navigate("about:crashextensions", "complete");
  } catch (error) {
    // The crash trigger can abort its own navigation; the stopped-page assertion is authoritative.
    run.crashNavigationError = error.message;
  }
}

async function runMode(mode) {
  const run = { mode, status: "failed" };
  let browser;
  try {
    const extension = join(temp, `${mode}-extension`);
    await cp("dist/firefox", extension, { recursive: true });
    const manifestPath = join(extension, "manifest.json");
    const manifest = await Bun.file(manifestPath).json();
    assert.equal(manifest.version, version);
    if (mode === "proxy") {
      manifest.permissions.push("proxy");
      manifest.optional_permissions = [];
      // Keep content-script messages from becoming another wake route in this fixture.
      manifest.content_scripts = [];
    } else {
      assert(!manifest.permissions.includes("proxy"));
      assert(manifest.optional_permissions.includes("proxy"));
    }
    await writeFile(manifestPath, JSON.stringify(manifest));
    const backgroundPath = join(extension, "background.js");
    const background = curateBackground(
      await Bun.file(backgroundPath).text(),
      mode,
    );
    assert.equal(background.split(fixturePattern).length - 1, 3);
    await writeFile(backgroundPath, background);
    await writeFile(
      join(extension, "ui/wake-probe.html"),
      "<!doctype html><title>Script-free lifecycle probe</title>",
    );

    browser = await puppeteer.launch({
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_PATH ??
        "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
      headless: true,
      userDataDir: join(temp, `${mode}-profile`),
      protocolTimeout: 15000,
      env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
      extraPrefsFirefox: {
        "network.proxy.type": 0,
        "extensions.webextensions.warnings-as-errors": false,
        "extensions.webextensions.uuids": JSON.stringify({
          [extensionId]: extensionUuid,
        }),
      },
    });
    run.browser = await browser.version();
    await browser.installExtension(resolve(extension));
    const options = await extensionPage(browser, `${extensionUrl}options.html`);
    const state = await readState(options);
    const blockingRule = "|http://wake-fixture.invalid/blocked$document";
    const settings = {
      ...state.settings,
      adblock: false,
      contentFarms: false,
      proxy:
        mode === "proxy"
          ? {
              ...state.settings.proxy,
              enabled: true,
              type: "http",
              host: "127.0.0.1",
              port: server.address().port,
              mode: "sites",
              sites: ["wake-fixture.invalid"],
            }
          : { ...state.settings.proxy, enabled: false },
      ...(mode === "blocking"
        ? { customRules: blockingRule, statsEnabled: true }
        : {}),
    };
    const saved = await options.evaluate(
      (settings) =>
        browser.runtime.sendMessage({ type: "saveSettings", settings }),
      settings,
    );
    assert(saved.ok, saved.error);

    if (mode === "proxy") {
      assert.equal(saved.capabilities.proxyPermission, true);
      const before = await extensionPage(
        browser,
        `${extensionUrl}wake-probe.html?before-crash`,
      );
      assert(
        await before.evaluate(() => !!browser.extension.getBackgroundPage()),
      );
      await crashExtension(browser, run);
      const after = await extensionPage(
        browser,
        `${extensionUrl}wake-probe.html?after-crash`,
      );
      run.backgroundBeforeRequest = await after.evaluate(
        () => !!browser.extension.getBackgroundPage(),
      );
      assert.equal(
        run.backgroundBeforeRequest,
        false,
        "Script-free probe must observe the stopped background without waking it",
      );
      const request = await browser.newPage();
      request.setDefaultNavigationTimeout(10000);
      await request.goto("http://wake-fixture.invalid/probe");
      run.proxyBody = await request.$eval("body", (element) =>
        element.textContent.trim(),
      );
      assert.equal(run.proxyBody, "wake-proxy-fixture");
      run.backgroundAfterRequest = await after.evaluate(
        () => !!browser.extension.getBackgroundPage(),
      );
      assert.equal(run.backgroundAfterRequest, true);
    } else {
      assert.equal(manifest.optional_permissions.includes("proxy"), true);
      assert.equal(saved.capabilities.proxyPermission, false);
      assert.equal(saved.settings.proxy.enabled, false);
      assert.equal(saved.settings.statsEnabled, true);
      assert.equal(saved.capabilities.nativeFallback, false);
      assert.equal(saved.capabilities.blockingStats, true);
      assert(Number.isInteger(saved.stats.blockedRequests));

      const blockUrl = "http://wake-fixture.invalid/blocked";
      const beforeWarm = saved.stats.blockedRequests;
      const request = await extensionPage(
        browser,
        `${extensionUrl}wake-probe.html?blocking-target`,
      );
      run.tabId = await request.evaluate(
        async () => (await browser.tabs.getCurrent())?.id,
      );
      assert(
        Number.isInteger(run.tabId),
        "Could not identify the blocking tab",
      );
      request.setDefaultNavigationTimeout(10000);
      try {
        await request.goto(blockUrl);
        run.warmNavigation = "resolved";
      } catch (error) {
        run.warmNavigation = error.message;
      }
      const warmState = await waitFor(
        "warm block counter",
        () => readState(options),
        (value) => value.stats.blockedRequests >= beforeWarm + 1,
      );
      assert.equal(warmState.stats.blockedRequests, beforeWarm + 1);
      assert.equal(warmState.capabilities.nativeFallback, false);
      const warmActivity = await waitFor(
        "warm per-tab block activity",
        () => readActivity(options, run.tabId),
        (value) => value?.blockedRequests === 1 && value.recent?.length > 0,
      );
      const warmRecent = warmActivity.recent[0];
      assert.equal(warmRecent.action, "block");
      assert(warmRecent.filter.includes("wake-fixture.invalid/blocked"));
      run.warm = {
        blockedRequests: warmState.stats.blockedRequests,
        tabActivity: warmActivity,
      };

      await crashExtension(browser, run);
      const after = await extensionPage(
        browser,
        `${extensionUrl}wake-probe.html?after-crash`,
      );
      const sessionAfterCrash = await after.evaluate(async (key) => {
        const stored = await browser.storage.session.get(key);
        return {
          activity: stored[key] ?? null,
          backgroundAlive: !!browser.extension.getBackgroundPage(),
        };
      }, `tabActivity:${run.tabId}`);
      run.backgroundBeforeRequest = sessionAfterCrash.backgroundAlive;
      assert.deepEqual(sessionAfterCrash.activity, warmActivity);
      run.sessionSurvivedWithoutWake = true;
      assert.equal(
        run.backgroundBeforeRequest,
        false,
        "Script-free probe must read session storage without waking the background",
      );
      assert.equal(run.sessionSurvivedWithoutWake, true);

      try {
        await request.goto(blockUrl);
        run.blockedNavigation = "resolved";
      } catch (error) {
        run.blockedNavigation = error.message;
      }
      run.backgroundAfterRequest = await after.evaluate(
        () => !!browser.extension.getBackgroundPage(),
      );
      assert.equal(
        run.backgroundAfterRequest,
        true,
        "The selected main-frame block request must wake the background",
      );
      const afterState = await waitFor(
        "post-crash block counter",
        () => readState(after),
        (value) =>
          value.stats.blockedRequests >= warmState.stats.blockedRequests + 1,
      );
      assert.equal(afterState.capabilities.nativeFallback, false);
      assert.equal(afterState.capabilities.blockingStats, true);
      assert.equal(
        afterState.stats.blockedRequests,
        warmState.stats.blockedRequests + 1,
      );
      const activityAfterRequest = await waitFor(
        "post-crash per-tab block activity",
        () => readActivity(after, run.tabId),
        (value) =>
          value?.blockedRequests === 1 && value.recent?.[0]?.hits === 1,
      );
      const recentAfterRequest = activityAfterRequest.recent[0];
      assert.equal(recentAfterRequest.ruleId, warmRecent.ruleId);
      assert.equal(recentAfterRequest.action, "block");
      assert.equal(recentAfterRequest.filter, warmRecent.filter);
      run.blockingRule = blockingRule;
      run.blockedRequestsBeforePostCrash = warmState.stats.blockedRequests;
      run.blockedRequestsAfterPostCrash = afterState.stats.blockedRequests;
      run.tabActivityAfterPostCrash = activityAfterRequest;
    }
    run.status = "passed";
  } catch (error) {
    run.error = error.message;
  } finally {
    if (browser)
      await browser.close().catch((error) => {
        run.status = "failed";
        run.cleanupError = error.message;
      });
  }
  return run;
}

try {
  result.proxy = await runMode("proxy");
  result.blocking = await runMode("blocking");
  // Retain the original proxy result fields for consumers of the previous artifact schema.
  for (const key of [
    "browser",
    "crashNavigationError",
    "backgroundBeforeRequest",
    "backgroundAfterRequest",
  ])
    if (key in result.proxy) result[key] = result.proxy[key];
  result.status =
    result.proxy.status === "passed" && result.blocking.status === "passed"
      ? "passed"
      : "failed";
  if (result.status !== "passed") process.exitCode = 1;
} finally {
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
