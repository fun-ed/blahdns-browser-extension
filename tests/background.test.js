import { test, expect } from "bun:test";
import { DEFAULTS, DEFAULT_ADBLOCK_URL } from "../extension/core/settings.js";

let instance = 0;
async function backgroundFixture(
  storedSettings = structuredClone(DEFAULTS),
  {
    chromium = false,
    permission = false,
    startupGate,
    sessionFailure = false,
  } = {},
) {
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
      emit: (...args) => Promise.all([...listeners].map((fn) => fn(...args))),
      get size() {
        return listeners.size;
      },
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
      ...(chromium
        ? {}
        : { getBrowserInfo: async () => ({ name: "Firefox" }) }),
      onMessage: {
        addListener: (fn) => {
          messageHandler = fn;
        },
      },
      onInstalled: event(),
    },
    permissions: {
      contains: async () => permission,
      onAdded: event(),
      onRemoved: event(),
    },
    privacy: {
      network: { webRTCIPHandlingPolicy: setting("default") },
      websites: { resistFingerprinting: setting(false) },
    },
    proxy: chromium
      ? { settings: setting({ mode: "system" }) }
      : { onRequest: event() },
    scripting: {
      insertCSS: async (options) => css.push(options.css),
      removeCSS: async () => {},
    },
    webRequest: { onBeforeRequest: event() },
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
      session: {
        data: {},
        async get(key) {
          if (sessionFailure) throw new Error("Fixture session failure");
          return structuredClone(
            key === null ? this.data : { [key]: this.data[key] },
          );
        },
        async set(input) {
          Object.assign(this.data, structuredClone(input));
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete this.data[key];
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
    tabs: {
      query: async () => [],
      get: async (id) => ({
        id,
        url: "https://page.example/",
        incognito: false,
      }),
      onUpdated: event(),
      onRemoved: event(),
    },
  };
  globalThis.browser = api;
  globalThis.fetch = async () => {
    await startupGate;
    return new Response("! Fixture list\ntracker.example");
  };
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
    expect(result.error).toContain(
      "Firefox request filtering is not initialized",
    );
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

for (const chromium of [false, true]) {
  test(`${chromium ? "Chrome" : "Firefox"} startup session failures do not skip filtering or privacy controls`, async () => {
    const f = await backgroundFixture(
      {
        ...structuredClone(DEFAULTS),
        privacy: { ...DEFAULTS.privacy, webrtc: "public" },
      },
      { chromium, sessionFailure: true },
    );
    try {
      const state = await f.send({ type: "getState" });
      if (chromium) {
        expect(f.rules().some((rule) => rule.action.type === "block")).toBe(
          true,
        );
      } else {
        expect(
          await f.api.webRequest.onBeforeRequest.emit({
            url: "https://tracker.example/",
            type: "image",
            frameId: 0,
            tabId: 7,
            documentUrl: "https://page.example/",
          }),
        ).toEqual([{ cancel: true }]);
      }
      expect(state.capabilities.nativeFallback).toBe(false);
      expect(
        (await f.api.privacy.network.webRTCIPHandlingPolicy.get({})).value,
      ).toBe("default_public_interface_only");
      expect(state.error).toContain(
        "temporary statistics could not be cleared",
      );
      expect(
        (await f.send({ type: "getTabActivity", tabId: 7 })).activity,
      ).toBeNull();
    } finally {
      f.restore();
    }
  });
}
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

test("getState reads native status without writes or listener changes", async () => {
  const f = await backgroundFixture();
  try {
    await f.send({ type: "getState" });
    const mutations = [];
    const refuse = (name) => async () => {
      mutations.push(name);
      throw new Error(`Unexpected mutation: ${name}`);
    };
    for (const setting of [
      f.api.privacy.network.webRTCIPHandlingPolicy,
      f.api.privacy.websites.resistFingerprinting,
    ]) {
      setting.set = refuse("privacy.set");
      setting.clear = refuse("privacy.clear");
    }
    f.api.proxy.onRequest.addListener = refuse("proxy.addListener");
    f.api.proxy.onRequest.removeListener = refuse("proxy.removeListener");
    f.api.permissions.contains = async () => true;
    f.api.storage.local.set = refuse("storage.set");
    f.api.declarativeNetRequest.updateDynamicRules = refuse("DNR.update");
    for (let i = 0; i < 2; i++) {
      const state = await f.send({ type: "getState" });
      expect(state.ok).toBe(true);
      expect(state.privacyStatus.error).toBeUndefined();
      expect(state.privacyStatus.controls.webrtc.applied).toBe(true);
    }
    expect(mutations).toEqual([]);
    f.api.privacy.network.webRTCIPHandlingPolicy.get = async () => {
      throw new Error("Fixture read failure");
    };
    const failedRead = await f.send({ type: "getState" });
    expect(failedRead.ok).toBe(true);
    expect(failedRead.privacyStatus.error).toBeTruthy();
    expect(failedRead.proxyStatus).toBeDefined();
    expect(mutations).toEqual([]);
  } finally {
    f.restore();
  }
});

test.each(["webrtc", "fingerprinting"])(
  "failed %s release cannot persist native or master-off settings",
  async (control) => {
    const f = await backgroundFixture();
    try {
      const initial = await f.send({ type: "getState" });
      const active = {
        ...initial.settings,
        privacy: {
          ...initial.settings.privacy,
          [control]: control === "webrtc" ? "public" : "resist",
        },
      };
      expect(
        (await f.send({ type: "saveSettings", settings: active })).ok,
      ).toBe(true);
      const before = structuredClone(f.storage.settings),
        rules = f.rules();
      const setting =
        control === "webrtc"
          ? f.api.privacy.network.webRTCIPHandlingPolicy
          : f.api.privacy.websites.resistFingerprinting;
      setting.clear = async () => {};
      for (const candidate of [
        { ...before, privacy: { ...before.privacy, [control]: "native" } },
        { ...before, enabled: false },
      ]) {
        const result = await f.send({
          type: "saveSettings",
          settings: candidate,
        });
        expect(result.ok).toBe(false);
        expect(f.storage.settings).toEqual(before);
        expect(f.rules()).toEqual(rules);
      }
    } finally {
      f.restore();
    }
  },
);

test("failed Chromium proxy release cannot persist proxy-off or master-off settings", async () => {
  const f = await backgroundFixture(undefined, { chromium: true });
  try {
    const initial = await f.send({ type: "getState" });
    f.api.permissions.contains = async () => true;
    const active = {
      ...initial.settings,
      proxy: { ...initial.settings.proxy, enabled: true },
    };
    expect((await f.send({ type: "saveSettings", settings: active })).ok).toBe(
      true,
    );
    const before = structuredClone(f.storage.settings),
      rules = f.rules();
    f.api.proxy.settings.clear = async () => {};
    for (const candidate of [
      { ...before, proxy: { ...before.proxy, enabled: false } },
      { ...before, enabled: false },
    ]) {
      const result = await f.send({
        type: "saveSettings",
        settings: candidate,
      });
      expect(result.ok).toBe(false);
      expect(f.storage.settings).toEqual(before);
      expect(f.rules()).toEqual(rules);
    }
  } finally {
    f.restore();
  }
});

test("Firefox proxy listener registers before asynchronous permission resolution", async () => {
  let releasePermission;
  const permission = new Promise((resolve) => {
    releasePermission = resolve;
  });
  const f = await backgroundFixture(undefined, { permission });
  try {
    expect(f.api.proxy.onRequest.size).toBe(1);
  } finally {
    releasePermission(true);
    await f.send({ type: "getState" });
    f.restore();
  }
});

test("Firefox counts its cancellation decisions, scopes recent rules to tabs, and clears on navigation/opt-out", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    statsEnabled: true,
  });
  try {
    const state = await f.send({ type: "getState" });
    expect(state.error).toBeNull();
    expect(state.capabilities.blockingStats).toBe(true);
    expect(
      f
        .rules()
        .some((rule) => ["block", "redirect"].includes(rule.action.type)),
    ).toBe(false);
    const request = {
      url: "https://tracker.example/pixel?secret=never-store",
      type: "image",
      tabId: 7,
      frameId: 0,
      documentUrl: "https://page.example/",
      originUrl: "https://page.example/",
      incognito: false,
    };
    expect(await f.api.webRequest.onBeforeRequest.emit(request)).toEqual([
      { cancel: true },
    ]);
    let result = await f.send({ type: "getTabActivity", tabId: 7 });
    expect(result.activity.blockedRequests).toBe(1);
    expect(result.activity.recent[0].filter).toBe("||tracker.example^");
    expect(JSON.stringify(f.api.storage.session.data)).not.toContain("secret");
    expect(JSON.stringify(f.api.storage.session.data)).not.toContain(
      "page.example",
    );
    expect(
      (await f.send({ type: "getTabActivity", tabId: 8 })).activity
        .blockedRequests,
    ).toBe(0);
    await f.api.webRequest.onBeforeRequest.emit({
      ...request,
      url: "https://unmatched.example/network-failure",
    });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .blockedRequests,
    ).toBe(1);
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity.recent,
    ).toEqual([]);
    await f.api.webRequest.onBeforeRequest.emit(request);
    await f.send({
      type: "saveSettings",
      settings: { ...state.settings, statsEnabled: false },
    });
    result = await f.send({ type: "getTabActivity", tabId: 7 });
    expect(result.enabled).toBe(false);
    expect(result.activity).toBeNull();
    expect(f.api.storage.session.data).toEqual({});
    expect(await f.api.webRequest.onBeforeRequest.emit(request)).toEqual([
      { cancel: true },
    ]);
    expect(f.api.storage.session.data).toEqual({});
  } finally {
    f.restore();
  }
});

test("tab diagnostics reject page senders, invalid/private tabs and fabricated block counters", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    statsEnabled: true,
  });
  try {
    await f.send({ type: "getState" });
    expect(
      (
        await f.send(
          { type: "getTabActivity", tabId: 7 },
          { id: "fixture", url: "https://page.example/" },
        )
      ).ok,
    ).toBe(false);
    expect((await f.send({ type: "getTabActivity", tabId: -1 })).ok).toBe(
      false,
    );
    f.api.tabs.get = async () => ({
      url: "https://private.example/",
      incognito: true,
    });
    expect((await f.send({ type: "getTabActivity", tabId: 7 })).ok).toBe(false);
    expect(
      (
        await f.send(
          { type: "recordStats", kind: "blockedRequests", amount: 99 },
          {
            id: "fixture",
            url: "https://page.example/",
            tab: { id: 7, url: "https://page.example/" },
            frameId: 0,
          },
        )
      ).ok,
    ).toBe(true);
    expect((await f.send({ type: "getState" })).stats.blockedRequests).toBe(0);
  } finally {
    f.restore();
  }
});

test("Firefox failed save restores its live blocking evaluator", async () => {
  const f = await backgroundFixture();
  try {
    const state = await f.send({ type: "getState" });
    f.failWrite();
    expect(
      (
        await f.send({
          type: "saveSettings",
          settings: { ...state.settings, customRules: "newly-blocked.example" },
        })
      ).ok,
    ).toBe(false);
    expect(
      await f.api.webRequest.onBeforeRequest.emit({
        url: "https://newly-blocked.example/",
        type: "image",
        frameId: 0,
        tabId: 7,
        documentUrl: "https://page.example/",
      }),
    ).toEqual([undefined]);
    expect(
      await f.api.webRequest.onBeforeRequest.emit({
        url: "https://tracker.example/",
        type: "image",
        frameId: 0,
        tabId: 7,
        documentUrl: "https://page.example/",
      }),
    ).toEqual([{ cancel: true }]);
  } finally {
    f.restore();
  }
});

test("Chrome records the native event that arrives before worker initialization completes", async () => {
  let release;
  const startupGate = new Promise((resolve) => {
    release = resolve;
  });
  const f = await backgroundFixture(
    { ...structuredClone(DEFAULTS), statsEnabled: true },
    { chromium: true, startupGate },
  );
  try {
    await f.api.declarativeNetRequest.onRuleMatchedDebug.emit({
      rule: { ruleId: 1 },
      request: {
        tabId: 7,
        url: "https://tracker.example/first",
        type: "image",
        incognito: false,
      },
    });
    release();
    expect((await f.send({ type: "getState" })).error).toBeNull();
    const result = await f.send({ type: "getTabActivity", tabId: 7 });
    expect(result.activity.blockedRequests).toBe(1);
    expect(result.activity.recent[0].filter).toBe("||tracker.example^");
  } finally {
    release();
    await f.send({ type: "getState" });
    f.restore();
  }
});

test("Chrome main-frame cleaning survives repeated loading events", async () => {
  const f = await backgroundFixture(
    { ...structuredClone(DEFAULTS), statsEnabled: true },
    { chromium: true },
  );
  try {
    await f.send({ type: "getState" });
    const rule = f.rules().find((rule) => rule.action.type === "redirect");
    await f.api.declarativeNetRequest.onRuleMatchedDebug.emit({
      rule: { ruleId: rule.id },
      request: {
        tabId: 7,
        type: "main_frame",
        requestId: "nav-chrome",
        url: "https://page.example/?utm_source=test",
        incognito: false,
      },
    });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(1);
    await f.api.tabs.onUpdated.emit(7, { status: "complete" });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(0);
  } finally {
    f.restore();
  }
});

test("Firefox startup matcher errors use native fallback and preserve it on failed repair", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    statsEnabled: true,
    customRules: "/a{1001}/",
  });
  try {
    const state = await f.send({ type: "getState" });
    expect(state.error).toContain("Native DNR fallback filtering is active");
    expect(state.capabilities.nativeFallback).toBe(true);
    expect(state.capabilities.blockingStats).toBe(false);
    expect(state.stats.blockedRequests).toBeNull();
    const before = f.rules();
    expect(before.some((rule) => rule.action.type === "block")).toBe(true);
    const activity = await f.send({ type: "getTabActivity", tabId: 7 });
    expect(activity.available).toBe(false);
    expect(activity.reason).toContain("native fallback");
    f.failWrite();
    expect(
      (
        await f.send({
          type: "saveSettings",
          settings: { ...state.settings, customRules: "" },
        })
      ).ok,
    ).toBe(false);
    expect(f.rules()).toEqual(before);
    expect(
      (await f.send({ type: "getState" })).capabilities.nativeFallback,
    ).toBe(true);
    const repaired = await f.send({
      type: "saveSettings",
      settings: { ...state.settings, customRules: "" },
    });
    expect(repaired.ok).toBe(true);
    expect(repaired.capabilities.nativeFallback).toBe(false);
    expect(repaired.capabilities.blockingStats).toBe(true);
  } finally {
    f.restore();
  }
});

test("main-frame cleaning survives either ordering of request and loading events", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    statsEnabled: true,
  });
  try {
    await f.send({ type: "getState" });
    const request = {
      tabId: 7,
      frameId: 0,
      type: "main_frame",
      requestId: "nav-1",
      url: "https://page.example/?utm_source=test&keep=1",
      incognito: false,
    };
    expect(await f.api.webRequest.onBeforeRequest.emit(request)).toEqual([
      { redirectUrl: "https://page.example/?keep=1" },
    ]);
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(1);
    await f.api.webRequest.onBeforeRequest.emit({
      ...request,
      url: "https://page.example/?keep=1",
    });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(1);
    await f.api.tabs.onUpdated.emit(7, { status: "complete" });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    await f.api.webRequest.onBeforeRequest.emit({
      ...request,
      requestId: "nav-2",
    });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(1);
    await f.api.webRequest.onBeforeRequest.emit({
      ...request,
      requestId: "nav-2",
      url: "https://page.example/?keep=1",
    });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(1);
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .cleanedRequests,
    ).toBe(1);
    await f.api.tabs.onUpdated.emit(7, { status: "complete" });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity.recent,
    ).toEqual([]);
  } finally {
    f.restore();
  }
});

test("late requests from a previous page do not populate the next page's activity", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    statsEnabled: true,
  });
  try {
    await f.send({ type: "getState" });
    const pending = f.api.webRequest.onBeforeRequest.emit({
      tabId: 7,
      frameId: 0,
      type: "image",
      url: "https://tracker.example/old",
      documentUrl: "https://old.example/",
      incognito: false,
    });
    await f.api.tabs.onUpdated.emit(7, { status: "loading" });
    expect(await pending).toEqual([{ cancel: true }]);
    expect(
      (await f.send({ type: "getTabActivity", tabId: 7 })).activity
        .blockedRequests,
    ).toBe(0);
  } finally {
    f.restore();
  }
});

test("late rule events cannot recreate activity for a closed tab", async () => {
  const f = await backgroundFixture({
    ...structuredClone(DEFAULTS),
    statsEnabled: true,
  });
  try {
    await f.send({ type: "getState" });
    await f.api.tabs.onRemoved.emit(7);
    f.api.tabs.get = async () => {
      throw new Error("No tab");
    };
    await f.api.webRequest.onBeforeRequest.emit({
      tabId: 7,
      frameId: 0,
      type: "image",
      url: "https://tracker.example/late",
      documentUrl: "https://closed.example/",
      incognito: false,
    });
    await f.send({ type: "getState" });
    expect(f.api.storage.session.data).toEqual({});
  } finally {
    f.restore();
  }
});
