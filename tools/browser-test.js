import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_ADBLOCK_URL } from "../extension/core/settings.js";
const packageVersion = (await Bun.file("package.json").json()).version;

const config = {
  chrome:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  brave:
    process.env.BRAVE_PATH ??
    "/Applications/Brave Browser Beta.app/Contents/MacOS/Brave Browser Beta",
  firefox:
    process.env.FIREFOX_PATH ??
    "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
};
const selected = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(config);
const results = [];
const fixture = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url.startsWith("/headers")) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.headers));
    return;
  }
  if (req.url.startsWith("/blocked")) {
    res.end("reached");
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src http: ws:; style-src 'none'; script-src 'none'",
  );
  res.end(
    '<!doctype html><html lang="en"><title>Privacy fixture</title><div class="advert">Advertisement fixture</div><a id="clean" href="/landing?utm_source=fixture&keep=1">Clean link</a><p>Local browser test.</p></html>',
  );
});
fixture.on("upgrade", (req, socket) => {
  const accept = createHash("sha1")
    .update(
      req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
    )
    .digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.on("data", () => {});
  socket.on("error", () => {});
});
await new Promise((resolveReady) => fixture.listen(0, "0.0.0.0", resolveReady));
const port = fixture.address().port;
const base = `http://localhost:${port}`;
const proxy = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.end("proxy-fixture");
});
await new Promise((resolveReady) => proxy.listen(0, "127.0.0.1", resolveReady));
const proxyPort = proxy.address().port;
const socksHosts = [];
const socks = createTcpServer((socket) => {
  let stage = 0,
    buffer = Buffer.alloc(0);
  socket.setTimeout(5000, () => socket.destroy());
  socket.on("error", () => {});
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (stage === 0) {
      if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
      if (buffer[0] !== 5) {
        socket.destroy();
        return;
      }
      buffer = buffer.subarray(2 + buffer[1]);
      socket.write(Buffer.from([5, 0]));
      stage = 1;
    }
    if (stage === 1) {
      if (buffer.length < 5) return;
      const addressLength =
        buffer[3] === 3 ? buffer[4] + 1 : buffer[3] === 1 ? 4 : 16;
      if (buffer.length < 4 + addressLength + 2) return;
      socksHosts.push(
        buffer[3] === 3
          ? buffer.subarray(5, 4 + addressLength).toString()
          : "IP",
      );
      buffer = buffer.subarray(4 + addressLength + 2);
      socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
      stage = 2;
    }
    if (stage === 2 && buffer.includes("\r\n\r\n")) {
      socket.end(
        "HTTP/1.1 200 OK\r\nContent-Length: 13\r\nConnection: close\r\n\r\nsocks-fixture",
      );
      stage = 3;
    }
  });
});
await new Promise((resolveReady) => socks.listen(0, "127.0.0.1", resolveReady));
const socksPort = socks.address().port;
await mkdir("artifacts/screenshots", { recursive: true });
try {
  for (const name of selected) {
    assert(config[name], `Unknown browser: ${name}`);
    const temp = await mkdtemp(join(tmpdir(), "blahdns-browser-test-"));
    let browser;
    const record = { browser: name, checks: [], status: "failed" };
    results.push(record);
    try {
      const target = name === "firefox" ? "firefox" : "chromium";
      const extension = join(temp, "extension");
      await cp(`dist/${target}`, extension, { recursive: true });
      // Grant the optional API only in the isolated test copy. Release permissions stay optional.
      const manifest = await Bun.file(join(extension, "manifest.json")).json();
      manifest.permissions.push("proxy");
      manifest.optional_permissions = [];
      await writeFile(
        join(extension, "manifest.json"),
        JSON.stringify(manifest),
      );
      browser = await puppeteer.launch({
        executablePath: config[name],
        browser: name === "firefox" ? "firefox" : "chrome",
        headless: true,
        userDataDir: join(temp, "profile"),
        enableExtensions: true,
        timeout: 15000,
        protocolTimeout: 15000,
        defaultViewport: { width: 1280, height: 800 },
        args: name === "firefox" ? [] : ["--enable-unsafe-extension-debugging"],
        // Firefox restricts extension-page automation unless this isolated child opts in.
        env:
          name === "firefox"
            ? { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" }
            : process.env,
        extraPrefsFirefox: {
          "extensions.webextensions.warnings-as-errors": false,
          "network.proxy.type": 0,
          "extensions.webextensions.keepUuidOnUninstall": true,
          "extensions.webextensions.uuids": JSON.stringify({
            "browser-extension@blahdns.com":
              "7d8dd33f-49e7-479e-a85b-283a03d2b42b",
          }),
        },
      });
      console.log(`${name}: launched isolated browser`);
      record.version = await browser.version();
      console.log(`${name}: ${record.version}`);
      if (name === "firefox") {
        const id = await browser.installExtension(
          resolve(`artifacts/blahdns-firefox-${packageVersion}.xpi`),
        );
        const xpiPage = await browser.newPage();
        await xpiPage
          .mainFrame()
          .browsingContext.navigate(
            "moz-extension://7d8dd33f-49e7-479e-a85b-283a03d2b42b/ui/options.html",
            "complete",
          );
        const installed = await xpiPage.evaluate(async () => ({
          state: await browser.runtime.sendMessage({ type: "getState" }),
          version: browser.runtime.getManifest().version,
        }));
        assert.equal(installed.version, packageVersion);
        assert.equal(installed.state.error, null);
        assert.equal(installed.state.capabilities.proxyPermission, false);
        assert.equal(installed.state.defaultList.url, DEFAULT_ADBLOCK_URL);
        assert(installed.state.report.domains > 100000);
        await browser.uninstallExtension(id);
        record.checks.push(
          "unmodified unsigned XPI installs with proxy permission absent",
        );
      } else {
        const id = await browser.installExtension(resolve("dist/chromium"));
        const fresh = await browser.newPage();
        await fresh.goto(`chrome-extension://${id}/ui/options.html`);
        await fresh.waitForFunction(() =>
          document
            .getElementById("proxy-status")
            .textContent.includes("permission"),
        );
        const state = await fresh.evaluate(() =>
          chrome.runtime.sendMessage({ type: "getState" }),
        );
        assert.equal(state.error, null);
        assert.equal(state.capabilities.proxyPermission, false);
        assert(!state.proxyStatus.message.includes("does not support"));
        await fresh.close();
        await browser.uninstallExtension(id);
        record.checks.push(
          "unmodified first install reports optional proxy permission accurately",
        );
      }
      const installedId = await browser.installExtension(resolve(extension));
      record.checks.push("test extension installed");
      console.log(`${name}: extension installed`);
      let options;
      if (name === "firefox") {
        options = await browser.newPage();
        // Firefox filters extension lifecycle events, so use the command completion signal.
        await options
          .mainFrame()
          .browsingContext.navigate(
            "moz-extension://7d8dd33f-49e7-479e-a85b-283a03d2b42b/ui/options.html",
            "complete",
          );
      } else {
        const optionsTarget = await browser.waitForTarget(
          (t) =>
            t.url().startsWith(`chrome-extension://${installedId}/`) &&
            t.url().includes("/ui/options.html"),
          { timeout: 30000 },
        );
        options = await optionsTarget.page();
      }
      options.setDefaultTimeout(10000);
      options.setDefaultNavigationTimeout(10000);
      await options.waitForFunction(
        () => !!(globalThis.browser ?? globalThis.chrome)?.runtime?.id,
      );
      const send = (message) =>
        options.evaluate(
          (m) =>
            (globalThis.browser ?? globalThis.chrome).runtime.sendMessage(m),
          message,
        );
      let state = await send({ type: "getState" });
      assert(state.ok, state.error);
      assert.equal(state.error, null, state.error);
      assert.equal(
        await options.evaluate(
          async () =>
            (
              await (
                globalThis.browser ?? globalThis.chrome
              ).declarativeNetRequest.getDynamicRules()
            ).length,
        ),
        state.report.rules,
      );
      assert(state.report.domains > 1000);
      record.checks.push("default lists installed");
      console.log(`${name}: default rules applied`);
      const original = structuredClone(state.settings);
      await options.waitForFunction(
        () => !document.querySelector("#save-button").disabled,
      );
      assert.equal(state.settings.theme, "system");
      assert.equal(state.defaultList.url, DEFAULT_ADBLOCK_URL);
      assert.equal(state.defaultList.updatedAt, null);
      assert.equal(state.report.unsupported.length, 0);
      await options.click("#tab-data");
      for (const theme of ["light", "dark"]) {
        await options.select("#theme", theme);
        assert.equal(
          await options.evaluate(() => document.documentElement.dataset.theme),
          theme,
        );
        await options.click("#save-button");
        await options.waitForFunction(() =>
          document
            .querySelector("#save-state")
            .textContent.includes("Settings saved."),
        );
        assert.equal((await send({ type: "getState" })).settings.theme, theme);
        const contrast = await options.evaluate(() => {
          const style = getComputedStyle(
            document.querySelector("#save-button"),
          );
          const context = document.createElement("canvas").getContext("2d");
          const luminance = (color) => {
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const channels = [...context.getImageData(0, 0, 1, 1).data]
              .slice(0, 3)
              .map((value) => {
                const v = value / 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              });
            return (
              channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
            );
          };
          const foreground = luminance(style.color),
            background = luminance(style.backgroundColor);
          return (
            (Math.max(foreground, background) + 0.05) /
            (Math.min(foreground, background) + 0.05)
          );
        });
        assert(
          contrast >= 4.5,
          `${theme} save-button text contrast: ${contrast}`,
        );
        (record.primaryButtonContrast ??= {})[theme] = contrast;
        await options.screenshot({
          path: `artifacts/screenshots/${name}-settings-${theme}.png`,
          fullPage: true,
        });
        const popup = await browser.newPage();
        const popupUrl = options
          .url()
          .replace(/options\.html.*$/, "popup.html");
        if (name === "firefox")
          await popup
            .mainFrame()
            .browsingContext.navigate(popupUrl, "complete");
        else await popup.goto(popupUrl);
        await popup.waitForFunction(
          () => !document.querySelector("#global-toggle").disabled,
        );
        assert.equal(
          await popup.evaluate(() => document.documentElement.dataset.theme),
          theme,
        );
        await popup.screenshot({
          path: `artifacts/screenshots/${name}-popup-${theme}.png`,
        });
        await popup.close();
        if (name === "firefox")
          await options.evaluate(async () => {
            const tab = await browser.tabs.getCurrent();
            await browser.tabs.update(tab.id, { active: true });
          });
        else await options.bringToFront();
      }
      await options.select("#theme", "system");
      if (name !== "firefox") {
        for (const scheme of ["light", "dark"]) {
          await options.emulateMediaFeatures([
            { name: "prefers-color-scheme", value: scheme },
          ]);
          await options.waitForFunction(
            (expected) => document.documentElement.dataset.theme === expected,
            {},
            scheme,
          );
        }
        await options.emulateMediaFeatures([]);
      }
      await options.waitForFunction(
        () =>
          document.documentElement.dataset.theme ===
          (matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"),
      );
      await options.click("#save-button");
      await options.waitForFunction(() =>
        document
          .querySelector("#save-state")
          .textContent.includes("Settings saved."),
      );
      record.checks.push(
        "light/dark preview and save, popup theme, and native System preference",
      );
      await options.click("#tab-filtering");
      await options.click("#update-default-list");
      try {
        await options.waitForFunction(
          () =>
            document
              .querySelector("#save-state")
              .textContent.includes("BlahDNS Lite updated.") ||
            document.querySelector("#save-state").dataset.state === "error",
          { timeout: 25000 },
        );
      } catch (error) {
        const diagnostic = await options.evaluate(() => ({
          hash: location.hash,
          save: document.querySelector("#save-state").textContent,
          status: document.querySelector("#status").textContent,
          disabled: document.querySelector("#update-default-list").disabled,
          source: document.querySelector("#default-list-status").textContent,
          focused: document.hasFocus(),
        }));
        throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
      }
      const updateStatus = await options.$eval("#save-state", (element) => ({
        text: element.textContent,
        kind: element.dataset.state,
      }));
      assert.notEqual(updateStatus.kind, "error", updateStatus.text);
      const updated = await send({ type: "getState" });
      assert(Date.parse(updated.defaultList.updatedAt));
      assert.equal(updated.report.unsupported.length, 0);
      assert(updated.report.domains > 100000);
      record.checks.push("BlahDNS Lite manual update and cached source status");
      if (name !== "firefox") {
        const target = await browser.waitForTarget(
          (t) =>
            t.type() === "service_worker" && t.url().endsWith("/background.js"),
        );
        const worker = await target.worker();
        await worker.evaluate(() => {
          const api = globalThis.browser ?? globalThis.chrome;
          globalThis.__blahdnsOriginalSet = api.storage.local.set;
          api.storage.local.set = async (value) => {
            if (value.defaultList)
              throw new Error("Fixture default list storage failure");
            return globalThis.__blahdnsOriginalSet.call(
              api.storage.local,
              value,
            );
          };
        });
        let failed;
        try {
          failed = await send({ type: "updateDefaultList" });
        } finally {
          await worker.evaluate(() => {
            (globalThis.browser ?? globalThis.chrome).storage.local.set =
              globalThis.__blahdnsOriginalSet;
            delete globalThis.__blahdnsOriginalSet;
          });
        }
        assert.equal(failed.ok, false);
        assert(failed.error.includes("Fixture default list storage failure"));
        const retained = await send({ type: "getState" });
        assert.deepEqual(retained.defaultList, updated.defaultList);
        assert.deepEqual(retained.report, updated.report);
        assert.equal(
          await options.evaluate(
            async () =>
              (
                await (
                  globalThis.browser ?? globalThis.chrome
                ).storage.local.get("defaultList")
              ).defaultList.updatedAt,
          ),
          updated.defaultList.updatedAt,
        );
        record.checks.push(
          "default list storage failure restores old rules and retains cached source",
        );
        await worker.evaluate(() => {
          const api = globalThis.browser ?? globalThis.chrome;
          globalThis.__blahdnsNativeWrites = [];
          globalThis.__blahdnsNativeSettings = [
            api.privacy?.network?.webRTCIPHandlingPolicy,
            api.privacy?.websites?.resistFingerprinting,
            api.proxy?.settings,
          ]
            .filter(Boolean)
            .map((setting) => ({
              setting,
              set: setting.set,
              clear: setting.clear,
            }));
          for (const { setting } of globalThis.__blahdnsNativeSettings)
            for (const method of ["set", "clear"])
              setting[method] = async () => {
                globalThis.__blahdnsNativeWrites.push(method);
                throw new Error("Unexpected native write during getState");
              };
        });
        try {
          const read = await send({ type: "getState" });
          assert(read.ok, read.error);
          assert.equal(read.privacyStatus.error, undefined);
          assert.equal(read.proxyStatus.error, undefined);
          assert.deepEqual(
            await worker.evaluate(() => globalThis.__blahdnsNativeWrites),
            [],
          );
        } finally {
          await worker.evaluate(() => {
            for (const {
              setting,
              set,
              clear,
            } of globalThis.__blahdnsNativeSettings)
              Object.assign(setting, { set, clear });
            delete globalThis.__blahdnsNativeSettings;
            delete globalThis.__blahdnsNativeWrites;
          });
        }
        record.checks.push(
          "getState reads native privacy and proxy status without writes",
        );
      }
      await options.$eval("#customRules", (element) => {
        element.value = "ui-tracker.example";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await options.click("#save-button");
      await options.waitForFunction(() =>
        document
          .querySelector("#save-state")
          .textContent.includes("Settings saved."),
      );
      assert.equal(
        (await send({ type: "getState" })).settings.customRules,
        "ui-tracker.example",
      );
      await options.click("#tab-data");
      const imported = { ...original, cleanUrls: false, statsEnabled: true };
      const importPath = join(temp, "import-settings.json");
      await writeFile(importPath, JSON.stringify(imported));
      if (name === "firefox") {
        // BiDi setFiles rejects extension contexts; exercise the same File input handler.
        await options.evaluate((settings) => {
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([JSON.stringify(settings)], "import-settings.json", {
              type: "application/json",
            }),
          );
          const input = document.querySelector("#import-file");
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }, imported);
      } else await (await options.$("#import-file")).uploadFile(importPath);
      await options.waitForFunction(
        () => !document.querySelector("#apply-import").disabled,
      );
      await options.click("#apply-import");
      await options.waitForFunction(
        () =>
          document.querySelector("#import-name").textContent ===
          "Settings imported and validated.",
      );
      assert.deepEqual((await send({ type: "getState" })).settings, imported);
      const exported = await options.evaluate(
        () =>
          new Promise((resolveExport, rejectExport) => {
            const create = URL.createObjectURL,
              click = HTMLAnchorElement.prototype.click;
            const restore = () => {
              URL.createObjectURL = create;
              HTMLAnchorElement.prototype.click = click;
            };
            const timer = setTimeout(() => {
              restore();
              rejectExport(new Error("Export payload was not created"));
            }, 5000);
            // Capture the real UI payload without writing to the user's Downloads folder.
            HTMLAnchorElement.prototype.click = () => {};
            URL.createObjectURL = (blob) => {
              const url = create.call(URL, blob);
              blob.text().then(
                (text) => {
                  clearTimeout(timer);
                  restore();
                  resolveExport(JSON.parse(text));
                },
                (error) => {
                  clearTimeout(timer);
                  restore();
                  rejectExport(error);
                },
              );
              return url;
            };
            document.querySelector("#export-settings").click();
          }),
      );
      assert.deepEqual(exported, imported);
      record.checks.push(
        "settings UI save, file import, and serialized export payload",
      );
      const unsafeSelectors = [
        ".x/*",
        ".x*/",
        `.x[a="`,
        `.x[a='`,
        ".x(",
        ".x[",
        ".x\\",
        ".x([)]",
        ".x]",
        ".x)",
        `.x[a="\f"]`,
      ];
      let settings = {
        ...original,
        adblock: false,
        contentFarms: false,
        statsEnabled: true,
        customRules: `|http://127.0.0.1:${port}/blocked$xmlhttprequest\n|ws://127.0.0.1:${port}/socket$websocket\n${unsafeSelectors.map((selector) => `localhost##${selector}`).join("\n")}\nlocalhost##.advert`,
      };
      const save = async (next) => {
        const result = await send({ type: "saveSettings", settings: next });
        assert(result.ok, result.error);
        settings = structuredClone(result.settings);
        return result;
      };
      const fixtureState = await save(settings);
      assert.equal(
        fixtureState.report.unsupported.length,
        unsafeSelectors.length,
      );
      record.checks.push(
        "unsafe CSS token structures rejected while valid cosmetic rule remains active",
      );
      console.log(`${name}: fixture rules applied`);
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(10000);
      await page.goto(`${base}/page`);
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector(".advert")).display ===
          "none",
      );
      await page.waitForFunction(
        () => !document.querySelector("#clean").href.includes("utm_source"),
      );
      record.checks.push("cosmetic filtering and link cleaning");
      const blockedFetch = await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      }, `http://127.0.0.1:${port}/blocked`);
      assert(blockedFetch);
      const blockedSocket = await page.evaluate(
        (url) =>
          new Promise((resolveResult) => {
            const socket = new WebSocket(url);
            const timer = setTimeout(() => {
              socket.close();
              resolveResult("timeout");
            }, 3000);
            socket.onopen = () => {
              clearTimeout(timer);
              socket.close();
              resolveResult("open");
            };
            socket.onerror = () => {
              clearTimeout(timer);
              resolveResult("blocked");
            };
          }),
        `ws://127.0.0.1:${port}/socket`,
      );
      assert.equal(blockedSocket, "blocked");
      record.checks.push("HTTP request and WebSocket handshake blocked");
      console.log(`${name}: network, WebSocket, CSS, and links passed`);
      const counters = (await send({ type: "getState" })).stats;
      assert(counters.cleanedLinks > 0);
      assert(counters.cosmeticPages > 0);
      assert.deepEqual(Object.keys(counters).sort(), [
        "blockedRequests",
        "cleanedLinks",
        "cosmeticPages",
      ]);
      record.checks.push(
        "opt-in statistics contain real aggregate counters without history",
      );
      await page.goto(`${base}/landing?utm_source=fixture&keep=1`);
      assert(!page.url().includes("utm_source"));
      assert(page.url().includes("keep=1"));
      await page.goto(`${base}/landing?utm_source=fixture&sig=preserve`);
      assert(page.url().includes("utm_source"));
      assert(page.url().includes("sig=preserve"));
      record.checks.push("navigation redirect and signed-URL exemption");
      await save({
        ...settings,
        privacy: {
          ...settings.privacy,
          language: "en-US",
          userAgent: "BlahDNS-Integration/1",
          webrtc: "public",
        },
      });
      const headers = await page.evaluate(async () =>
        (await fetch("/headers")).json(),
      );
      assert.equal(headers["user-agent"], "BlahDNS-Integration/1");
      assert.equal(headers["accept-language"], "en-US,en;q=0.9");
      const rtc = await options.evaluate(async () =>
        (
          globalThis.browser ?? globalThis.chrome
        ).privacy.network.webRTCIPHandlingPolicy.get({}),
      );
      assert.equal(rtc.value, "default_public_interface_only");
      record.checks.push(
        "UA/language request headers and native WebRTC read-back",
      );
      if (name === "firefox") {
        await save({
          ...settings,
          privacy: { ...settings.privacy, fingerprinting: "resist" },
        });
        const rfp = await options.evaluate(async () =>
          browser.privacy.websites.resistFingerprinting.get({}),
        );
        assert.equal(rfp.value, true);
        record.checks.push("Firefox native fingerprint resistance read-back");
        await save({
          ...settings,
          privacy: { ...settings.privacy, fingerprinting: "native" },
        });
      }
      await save({ ...settings, exceptions: ["*.localhost"] });
      await page.goto(`${base}/page`);
      assert.equal(
        await page.evaluate(
          async (url) => (await fetch(url)).text(),
          `http://127.0.0.1:${port}/blocked`,
        ),
        "reached",
      );
      assert.equal(
        await page.$eval(".advert", (el) => getComputedStyle(el).display),
        "block",
      );
      record.checks.push(
        "wildcard pause releases network and cosmetic filtering",
      );
      await save({
        ...settings,
        mode: "sites",
        sites: ["localhost"],
        exceptions: [],
      });
      await page.goto(`http://127.0.0.1:${port}/page`);
      assert.equal(
        await page.evaluate(async () => (await fetch("/blocked")).text()),
        "reached",
      );
      await page.goto(`${base}/page`);
      assert(
        await page.evaluate(async (url) => {
          try {
            await fetch(url);
            return false;
          } catch {
            return true;
          }
        }, `http://127.0.0.1:${port}/blocked`),
      );
      record.checks.push(
        "selected-site mode includes only the selected domain tree",
      );
      const invalid = await send({
        type: "saveSettings",
        settings: {
          ...settings,
          privacy: { ...settings.privacy, userAgent: "bad\r\nheader" },
        },
      });
      assert.equal(invalid.ok, false);
      state = await send({ type: "getState" });
      assert.deepEqual(state.settings, settings);
      record.checks.push("invalid import leaves active settings intact");
      console.log(`${name}: privacy and scope checks passed`);
      await save({
        ...settings,
        mode: "global",
        proxy: {
          ...settings.proxy,
          enabled: true,
          host: "127.0.0.1",
          port: proxyPort,
          type: "http",
          mode: "sites",
          sites: ["proxy-fixture.invalid"],
          bypass: [],
        },
      });
      const httpStatus = await send({ type: "getState" });
      assert.equal(httpStatus.settings.proxy.enabled, true);
      assert.equal(
        httpStatus.proxyStatus.applied,
        true,
        JSON.stringify(httpStatus.proxyStatus),
      );
      record.checks.push("enabled HTTP proxy getState confirms active routing");
      const proxyPage = await browser.newPage();
      proxyPage.setDefaultNavigationTimeout(10000);
      await proxyPage.goto("http://proxy-fixture.invalid/probe");
      assert.equal(
        await proxyPage.$eval("body", (el) => el.textContent.trim()),
        "proxy-fixture",
      );
      await save({ ...settings, proxy: { ...settings.proxy, enabled: false } });
      record.checks.push(
        "HTTP proxy routes selected destination with no direct fallback",
      );
      await save({
        ...settings,
        proxy: {
          ...settings.proxy,
          enabled: true,
          type: "socks5",
          port: socksPort,
          sites: ["socks-fixture.invalid"],
        },
      });
      const socksStatus = await send({ type: "getState" });
      assert.equal(socksStatus.settings.proxy.enabled, true);
      assert.equal(
        socksStatus.proxyStatus.applied,
        true,
        JSON.stringify(socksStatus.proxyStatus),
      );
      record.checks.push(
        "enabled SOCKS5 proxy getState confirms active routing",
      );
      await proxyPage.goto("http://socks-fixture.invalid/probe");
      assert.equal(
        await proxyPage.$eval("body", (el) => el.textContent.trim()),
        "socks-fixture",
      );
      assert(socksHosts.includes("socks-fixture.invalid"));
      record.checks.push(
        "SOCKS5 proxy receives the destination domain for remote DNS",
      );
      await save({ ...settings, proxy: { ...settings.proxy, enabled: false } });
      await save(original);
      if (name === "firefox") {
        options = await browser.newPage();
        await options
          .mainFrame()
          .browsingContext.navigate(
            "moz-extension://7d8dd33f-49e7-479e-a85b-283a03d2b42b/ui/options.html",
            "complete",
          );
      } else await options.reload();
      assert((await send({ type: "getState" })).ok);
      await options.screenshot({
        path: `artifacts/screenshots/${name}-settings.png`,
        fullPage: true,
      });
      record.checks.push("settings reopen and screenshot");
      record.status = "passed";
      console.log(
        `${name}: passed ${record.checks.length} checks (${record.version})`,
      );
    } catch (error) {
      record.error = error.message;
      console.error(`${name}: ${error.stack}`);
    } finally {
      if (browser) {
        let timer;
        try {
          await Promise.race([
            browser.close(),
            new Promise((resolveClosed) => {
              timer = setTimeout(resolveClosed, 3000);
            }),
          ]);
        } catch {
          /* The isolated browser can exit before the protocol closes. */
        } finally {
          clearTimeout(timer);
          const child = browser.process();
          if (child && child.exitCode === null) child.kill("SIGTERM");
        }
      }
      await rm(temp, { recursive: true, force: true });
    }
  }
} finally {
  fixture.closeAllConnections();
  proxy.closeAllConnections();
  fixture.close();
  proxy.close();
  socks.close();
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        note: "Isolated profiles. Optional proxy permission pre-granted in a test-only copy; native optional permission prompt not covered. HTTP/2, HTTP/3, QUIC transport and CAPTCHA outcomes are not tested.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
if (results.some((result) => result.status !== "passed")) process.exitCode = 1;
if (selected.includes("firefox") && !process.exitCode) {
  const wake = Bun.spawn(
    ["mise", "exec", "--", "bun", "tools/firefox-wake-test.js"],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (await wake.exited) process.exitCode = 1;
}
