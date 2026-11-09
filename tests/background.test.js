import { test, expect } from "bun:test";
import { DEFAULTS, DEFAULT_ADBLOCK_URL } from "../extension/core/settings.js";

let instance = 0;
async function backgroundFixture(storedSettings = structuredClone(DEFAULTS)) {
  const previousBrowser = globalThis.browser,
    previousFetch = globalThis.fetch;
  let messageHandler,
    rules = [],
    failNextWrite = false;
  const storage = { settings: structuredClone(storedSettings) };
  const css = [];
  const event = () => {
    const listeners = new Set();
    return {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      hasListener: (fn) => listeners.has(fn),
    };
  };
  const setting = (initial) => {
    let value = initial,
      controlled = false;
    return {
      get: async () => ({
        value,
        levelOfControl: controlled
          ? "controlled_by_this_extension"
          : "controllable_by_this_extension",
      }),
      set: async (input) => {
        value = input.value;
        controlled = true;
      },
      clear: async () => {
        value = initial;
        controlled = false;
      },
    };
  };
  const api = {
    runtime: {
      id: "fixture",
      getURL: (path) => `moz-extension://fixture/${path}`,
      getBrowserInfo: async () => ({ name: "Firefox" }),
      onMessage: {
        addListener: (fn) => {
          messageHandler = fn;
        },
      },
      onInstalled: event(),
    },
    permissions: {
      contains: async () => false,
      onAdded: event(),
      onRemoved: event(),
    },
    privacy: {
      network: { webRTCIPHandlingPolicy: setting("default") },
      websites: { resistFingerprinting: setting(false) },
    },
    proxy: { onRequest: event() },
    scripting: {
      insertCSS: async (options) => css.push(options.css),
      removeCSS: async () => {},
    },
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async (keys) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [
              key,
              structuredClone(storage[key]),
            ]),
          ),
        set: async (input) => {
          if (failNextWrite && input.settings) {
            failNextWrite = false;
            throw new Error("Fixture storage failure");
          }
          Object.assign(storage, structuredClone(input));
        },
        remove: async (key) => {
          delete storage[key];
        },
      },
    },
    declarativeNetRequest: {
      getDynamicRules: async () => structuredClone(rules),
      updateDynamicRules: async (input) => {
        rules = structuredClone(input.addRules);
      },
      isRegexSupported: async () => ({ isSupported: true }),
      onRuleMatchedDebug: event(),
    },
    tabs: { query: async () => [] },
  };
  globalThis.browser = api;
  globalThis.fetch = async () =>
    new Response("! Fixture list\ntracker.example");
  await import(`../extension/background.js?fixture=${++instance}`);
  const trustedSender = {
    id: "fixture",
    url: api.runtime.getURL("ui/options.html"),
  };
  return {
    api,
    storage,
    css,
    rules: () => structuredClone(rules),
    failWrite: () => {
      failNextWrite = true;
    },
    send: (message, sender = trustedSender) =>
      new Promise((resolve) => messageHandler(message, sender, resolve)),
    restore: () => {
      globalThis.browser = previousBrowser;
      globalThis.fetch = previousFetch;
    },
  };
}

test("background rejects privileged messages from content scripts", async () => {
  const f = await backgroundFixture();
  try {
    const initial = await f.send({ type: "getState" });
    expect(initial.ok).toBe(true);
    const result = await f.send(
      { type: "saveSettings", settings: { ...DEFAULTS, enabled: false } },
      {
        id: "fixture",
        url: "https://example.test/",
        tab: { id: 1, url: "https://example.test/" },
        frameId: 0,
      },
    );
    expect(result.ok).toBe(false);
    expect(f.storage.settings.enabled).toBe(true);
  } finally {
    f.restore();
  }
});
test("failed persistence restores active DNR rules and native privacy values", async () => {
  const f = await backgroundFixture();
  try {
    const initial = await f.send({ type: "getState" });
    const before = f.rules();
    f.failWrite();
    const result = await f.send({
      type: "saveSettings",
      settings: {
        ...initial.settings,
        customRules: "another-tracker.test",
        privacy: { ...initial.settings.privacy, webrtc: "public" },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Fixture storage failure");
    expect(f.rules()).toEqual(before);
    expect(f.storage.settings).toEqual(initial.settings);
    expect(
      (await f.api.privacy.network.webRTCIPHandlingPolicy.get({})).value,
    ).toBe("default");
  } finally {
    f.restore();
  }
});
test("invalid stored settings leave the recovery UI reachable", async () => {
  const f = await backgroundFixture({ version: 99 });
  try {
    const result = await f.send({ type: "getState" });
    expect(result.ok).toBe(true);
    expect(result.error).toContain("Unsupported settings version");
    expect(f.storage.settings.version).toBe(99);
    expect(
      (
        await f.send({
          type: "saveSettings",
          settings: structuredClone(DEFAULTS),
        })
      ).ok,
    ).toBe(true);
  } finally {
    f.restore();
  }
});
test("CSS injection uses compiled selectors and the sender frame only", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    customRules: "example.test##.advert",
  });
  try {
    const result = await f.send(
      { type: "getPolicy", previousCSS: "", selectors: ["body{color:red}"] },
      {
        id: "fixture",
        url: "https://example.test/",
        tab: { id: 7, url: "https://example.test/" },
        frameId: 0,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.cosmeticApplied).toBe(true);
    expect(f.css).toEqual([".advert{display:none!important}"]);
  } finally {
    f.restore();
  }
});
test("subscription redirect rejection keeps the cached rules unchanged", async () => {
  const settings = {
    ...structuredClone(DEFAULTS),
    subscriptions: [
      {
        url: "https://lists.example/filter.txt",
        text: "cached-tracker.example",
        updatedAt: "2026-11-09",
      },
    ],
  };
  const f = await backgroundFixture(settings);
  try {
    await f.send({ type: "getState" });
    globalThis.fetch = async (_url, options) => {
      expect(options.redirect).toBe("error");
      expect(options.credentials).toBe("omit");
      throw new Error("Redirect blocked");
    };
    const result = await f.send({ type: "updateSubscriptions" });
    expect(result.ok).toBe(false);
    expect(f.storage.settings.subscriptions).toEqual(settings.subscriptions);
  } finally {
    f.restore();
  }
});

test("default list updates replace the source and storage failure restores the old cache and rules", async () => {
  const f = await backgroundFixture();
  try {
    await f.send({ type: "getState" });
    let prefix = "new";
    globalThis.fetch = async (url, options) => {
      expect(url).toBe(DEFAULT_ADBLOCK_URL);
      expect(options.credentials).toBe("omit");
      expect(options.redirect).toBe("error");
      const body = Array.from(
        { length: 1000 },
        (_, i) => `||${prefix}${i}.example^`,
      ).join("\n");
      const response = new Response(body);
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    const updated = await f.send({ type: "updateDefaultList" });
    expect(updated.ok).toBe(true);
    expect(updated.defaultList.url).toBe(DEFAULT_ADBLOCK_URL);
    expect(updated.report.domains).toBe(1001);
    const cache = structuredClone(f.storage.defaultList),
      rules = f.rules();
    prefix = "replacement";
    f.failWrite();
    const failed = await f.send({ type: "updateDefaultList" });
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain("Fixture storage failure");
    expect(f.storage.defaultList).toEqual(cache);
    expect(f.rules()).toEqual(rules);
    expect((await f.send({ type: "getState" })).defaultList).toEqual(
      updated.defaultList,
    );
  } finally {
    f.restore();
  }
});

test("invalid or oversized default downloads cannot replace active rules", async () => {
  const f = await backgroundFixture();
  try {
    await f.send({ type: "getState" });
    const before = f.rules();
    for (const [body, contentType, error] of [
      ["<html>error</html>", "text/html", "HTML"],
      ["x".repeat(4_000_001), "text/plain", "4 MB"],
      ["||small.example^", "text/plain", "unexpectedly small"],
    ]) {
      globalThis.fetch = async (url) => {
        const response = new Response(body, {
          headers: { "content-type": contentType },
        });
        Object.defineProperty(response, "url", { value: url });
        return response;
      };
      const result = await f.send({ type: "updateDefaultList" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain(error);
      expect(f.rules()).toEqual(before);
      expect(f.storage.defaultList).toBeUndefined();
    }
  } finally {
    f.restore();
  }
});
