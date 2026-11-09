import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileRules } from "../extension/core/rules.js";
import { DEFAULTS } from "../extension/core/settings.js";
import { createFirefoxFilter } from "../extension/core/firefox-filter.js";
const groups = [
  {
    text: "||ads.example^$script\n||pre.fix$script\n/a/*/b.js$script\n/pixel^$image\nfile.gif|$image\n|https://left.example/ad$script\n/CaseOnly.$script,match-case\n/\\/track[0-9]+\\.gif/$image\n||[2001:db8::1]^$script",
    requests: [
      ["https://ads.example/x", "script"],
      ["https://a.ads.example/x", "script"],
      ["https://badads.example/x", "script"],
      ["https://ads.example.evil/x", "script"],
      ["https://ads.example@evil.example/x", "script"],
      ["https://evil.example/?x=https://ads.example/", "script"],
      ["https://ads.example/x", "image"],
      ["https://pre.fixture.test/", "script"],
      ["https://xpre.fix.test/", "script"],
      ["https://pre.fix@evil.test/", "script"],
      ["https://w.example/a/x/y/b.js", "script"],
      ["https://w.example/a/b.js", "script"],
      ["https://w.example/pixel", "image"],
      ["https://w.example/pixel?x", "image"],
      ["https://w.example/pixel.js", "image"],
      ["https://w.example/pixel%20", "image"],
      ["https://w.example/file.gif", "image"],
      ["https://w.example/file.gif?a", "image"],
      ["https://left.example/ad.js", "script"],
      ["https://evil.example/?x=https://left.example/ad.js", "script"],
      ["https://w.example/CaseOnly.js", "script"],
      ["https://w.example/caseonly.js", "script"],
      ["https://w.example/track42.gif", "image"],
      ["https://w.example/TRACK42.GIF", "image"],
      ["https://w.example/trackx.gif", "image"],
      ["https://[2001:db8::1]/ad.js", "script"],
      ["https://[2001:db8::1]:8443/ad.js", "script"],
      ["https://[2001:db8::2]/ad.js", "script"],
      ["https://[2001:db8::1]/ad.png", "image"],
    ],
  },
  {
    text: "|http$third-party,image\n|http$~third-party,script",
    requests: [
      ["https://img.example.co.uk/x", "image", "https://www.example.co.uk/"],
      ["https://a.co.uk/x", "image", "https://b.co.uk/"],
      ["https://alice.github.io/x", "image", "https://bob.github.io/"],
      ["https://cdn.alice.github.io/x", "image", "https://alice.github.io/"],
      ["http://192.168.1.1/x", "image", "http://192.168.1.1:8080/"],
      ["http://192.168.1.1/x", "image", "http://10.168.1.1/"],
      ["http://[::1]/x", "image", "http://[::1]/"],
      ["https://img.example.co.uk/x", "script", "https://www.example.co.uk/"],
      ["https://a.co.uk/x", "script", "https://b.co.uk/"],
      ["https://a.example/x", "image"],
    ],
  },
  {
    text: "||ads.test^\n@@||ads.test^$script\n||ads.test/x.js$important,script\n@@||safe.ads.test^\n||restricted.test^$domain=site.test|~login.site.test",
    requests: [
      ["https://ads.test/i.png", "image"],
      ["https://ads.test/a.js", "script"],
      ["https://ads.test/x.js", "script"],
      ["https://safe.ads.test/i.png", "image"],
      ["https://safe.ads.test/x.js", "script"],
      ["https://restricted.test/x", "image", "https://site.test/"],
      ["https://restricted.test/x", "image", "https://login.site.test/"],
      ["https://restricted.test/x", "image", "https://other.test/"],
      ["https://restricted.test/x", "image"],
    ],
  },
  {
    text: "||blocked.test^",
    cleanUrls: true,
    requests: [
      ["https://clean.test/x?utm_source=a&keep=1", "main_frame"],
      ["https://clean.test/x?utm_source=a&sig=preserve", "main_frame"],
      ["https://blocked.test/x?utm_source=a&sig=preserve", "main_frame"],
      ["https://clean.test/x?UTM_SOURCE=a", "main_frame"],
      ["https://clean.test/x?utm_source=a", "image"],
    ],
  },
];
const profile = await mkdtemp(join(tmpdir(), "blahdns-native-parity-"));
let browser,
  status = "failed";
const records = [];
try {
  browser = await puppeteer.launch({
    browser: "chrome",
    executablePath:
      process.env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    userDataDir: profile,
    enableExtensions: true,
    args: ["--enable-unsafe-extension-debugging"],
    timeout: 15000,
  });
  const id = await browser.installExtension(resolve("dist/chromium"));
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${id}/ui/options.html`);
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "getState" }));
  for (const [group, fixture] of groups.entries()) {
    const compiled = compileRules(
      { ...structuredClone(DEFAULTS), cleanUrls: fixture.cleanUrls ?? false },
      [{ name: "parity", text: fixture.text }],
    );
    assert.equal(compiled.report.unsupported.length, 0);
    const { evaluate } = createFirefoxFilter(compiled.rules);
    const native = await page.evaluate(
      async ({ rules, requests }) => {
        const api = chrome.declarativeNetRequest;
        await api.updateDynamicRules({
          removeRuleIds: (await api.getDynamicRules()).map((r) => r.id),
          addRules: rules,
        });
        return Promise.all(
          requests.map(([url, type, initiator]) =>
            api.testMatchOutcome({
              url,
              type,
              ...(initiator ? { initiator } : {}),
            }),
          ),
        );
      },
      { rules: compiled.rules, requests: fixture.requests },
    );
    for (const [index, [url, type, originUrl]] of fixture.requests.entries()) {
      const expected =
        native[index].matchedRules
          .map(
            ({ ruleId }) =>
              compiled.rules.find((r) => r.id === ruleId).action.type,
          )
          .find((action) => action === "block" || action === "redirect") ??
        null;
      const actual = evaluate({ url, type, originUrl })?.action ?? null;
      const record = {
        group,
        url,
        type,
        originUrl,
        expected,
        actual,
        matches: native[index].matchedRules,
      };
      records.push(record);
      assert.equal(actual, expected, JSON.stringify(record));
    }
  }
  status = "passed";
  console.log(
    JSON.stringify(
      {
        status: "passed",
        cases: records.length,
        browser: await browser.version(),
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await Bun.write(
      "artifacts/native-parity.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          version: (await Bun.file("package.json").json()).version,
          browser: browser ? await browser.version().catch(() => null) : null,
          status,
          cases: records.length,
          fixtures: groups,
          results: records,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await browser?.close();
    await rm(profile, { recursive: true, force: true });
  }
}
