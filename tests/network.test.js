import { expect, test } from "bun:test";
import { applyPrivacy } from "../extension/core/privacy.js";
import { ENDPOINTS, testDns } from "../extension/core/dns.js";
import {
  applyProxy,
  createPac,
  routeProxy,
  validateProxy,
} from "../extension/core/proxy.js";

const proxySettings = (overrides) => ({
  enabled: true,
  type: "http",
  host: "127.0.0.1",
  port: 8080,
  mode: "global",
  sites: [],
  bypass: [],
  ...overrides,
});

function evaluatePac(script, url, host) {
  const findProxyForURL = new Function(`${script}; return FindProxyForURL;`)();
  return findProxyForURL(url, host);
}

function browserSetting(
  value,
  levelOfControl = "controllable_by_this_extension",
  nativeValue = value,
) {
  let state = { value, levelOfControl };
  let clears = 0;
  return {
    getState: () => state,
    get clears() {
      return clears;
    },
    async get() {
      return state;
    },
    async set(details) {
      state = {
        value: details.value,
        levelOfControl: "controlled_by_this_extension",
      };
    },
    async clear() {
      clears++;
      state = {
        value: nativeValue,
        levelOfControl: "controllable_by_this_extension",
      };
    },
  };
}

function dnsResponse({
  id = 0xb17d,
  flags = 0x8180,
  address = [93, 184, 216, 34],
  answerCount = 1,
} = {}) {
  const question = [
    0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d,
    0x00, 0x00, 0x01, 0x00, 0x01,
  ];
  const answer = [
    0xc0,
    0x0c,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x3c,
    0x00,
    0x04,
    ...address,
  ];
  return Uint8Array.from([
    id >> 8,
    id & 0xff,
    flags >> 8,
    flags & 0xff,
    0x00,
    0x01,
    answerCount >> 8,
    answerCount & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
    ...question,
    ...(answerCount ? answer : []),
  ]);
}

async function withFetch(fetcher, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("proxy validation accepts the four supported transport types and rejects bad boundaries", () => {
  for (const type of ["http", "https", "socks4", "socks5"]) {
    expect(validateProxy(proxySettings({ type })).type).toBe(type);
  }
  expect(() => validateProxy(proxySettings({ port: 0 }))).toThrow();
  expect(() => validateProxy(proxySettings({ type: "ftp" }))).toThrow();
  expect(() =>
    validateProxy(proxySettings({ host: "proxy.example:8080" })),
  ).toThrow();
});

test("proxy scopes use normalized domain-tree patterns and respect sibling boundaries", () => {
  const proxy = proxySettings({ mode: "sites", sites: ["*.Example.com"] });
  expect(routeProxy(proxy, "https://example.com/")).toBeTruthy();
  expect(routeProxy(proxy, "https://api.example.com/")).toBeTruthy();
  expect(routeProxy(proxy, "https://deep.api.example.com/")).toBeTruthy();
  expect(routeProxy(proxy, "https://notexample.com/")).toBeUndefined();
  expect(routeProxy(proxy, "https://example.com.evil/")).toBeUndefined();
  const domain = proxySettings({ mode: "sites", sites: ["example.com"] });
  expect(routeProxy(domain, "https://example.com/")).toBeTruthy();
  expect(routeProxy(domain, "https://api.example.com/")).toBeTruthy();
  expect(
    routeProxy(proxySettings({ enabled: false }), "https://example.com/"),
  ).toBeUndefined();
});

test("proxy bypass applies to apex and subdomains", () => {
  const proxy = proxySettings({ bypass: ["*.internal.example"] });
  expect(routeProxy(proxy, "https://internal.example/")).toBeUndefined();
  expect(routeProxy(proxy, "https://host.internal.example/")).toBeUndefined();
  expect(routeProxy(proxy, "https://notinternal.example/")).toBeTruthy();
});

test("Firefox routes each proxy type and terminates fallback with null", () => {
  const expected = {
    http: "http",
    https: "https",
    socks4: "socks4",
    socks5: "socks",
  };
  for (const [type, nativeType] of Object.entries(expected)) {
    const result = routeProxy(proxySettings({ type }), "https://example.com/");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type: nativeType,
      host: "127.0.0.1",
      port: 8080,
    });
    expect(result[1]).toBeNull();
    expect(result[0].proxyDNS).toBe(type === "socks5" ? true : undefined);
  }
});

test("Chromium PAC emits the correct directive for each proxy type", () => {
  const expected = {
    http: "PROXY",
    https: "HTTPS",
    socks4: "SOCKS4",
    socks5: "SOCKS5",
  };
  for (const [type, directive] of Object.entries(expected)) {
    const pac = createPac(proxySettings({ type }));
    expect(evaluatePac(pac, "https://example.com/", "example.com")).toBe(
      `${directive} 127.0.0.1:8080`,
    );
  }
});

test("Chromium PAC selects scoped destinations without a direct fallback", () => {
  const proxy = proxySettings({
    mode: "sites",
    sites: ["*.example.com"],
    bypass: ["private.example.com"],
  });
  const pac = createPac(proxy);
  expect(evaluatePac(pac, "https://example.com/", "example.com")).toBe(
    "PROXY 127.0.0.1:8080",
  );
  expect(evaluatePac(pac, "https://api.example.com/", "api.example.com")).toBe(
    "PROXY 127.0.0.1:8080",
  );
  expect(
    evaluatePac(pac, "https://private.example.com/", "private.example.com"),
  ).toBe("DIRECT");
  expect(evaluatePac(pac, "https://notexample.com/", "notexample.com")).toBe(
    "DIRECT",
  );
  expect(
    evaluatePac(
      createPac(proxySettings({ enabled: false })),
      "https://example.com/",
      "example.com",
    ),
  ).toBe("DIRECT");
});

test("proxy application requires permission and installs mandatory PAC", async () => {
  let state = {
    value: { mode: "system" },
    levelOfControl: "controllable_by_this_extension",
  };
  let applied;
  const api = {
    permissions: {
      async contains() {
        return true;
      },
    },
    proxy: {
      settings: {
        async get() {
          return state;
        },
        async set(details) {
          applied = details;
          state = {
            value: details.value,
            levelOfControl: "controlled_by_this_extension",
          };
        },
        async clear() {
          throw new Error("Should not clear while enabling.");
        },
      },
    },
  };
  const result = await applyProxy(
    api,
    proxySettings({ mode: "sites", sites: ["example.com"] }),
  );
  expect(result.applied).toBe(true);
  expect(applied.value.mode).toBe("pac_script");
  expect(applied.value.pacScript.mandatory).toBe(true);
  expect(
    evaluatePac(
      applied.value.pacScript.data,
      "https://example.com/",
      "example.com",
    ),
  ).toBe("PROXY 127.0.0.1:8080");
});

test("proxy application supports Chromium callback APIs", async () => {
  let state = {
    value: { mode: "system" },
    levelOfControl: "controllable_by_this_extension",
  };
  const api = {
    permissions: {
      contains(_details, callback) {
        callback(true);
      },
    },
    proxy: {
      settings: {
        get(_details, callback) {
          callback(state);
        },
        set(details, callback) {
          state = {
            value: details.value,
            levelOfControl: "controlled_by_this_extension",
          };
          callback();
        },
        clear(_details, callback) {
          callback();
        },
      },
    },
  };
  const result = await applyProxy(api, proxySettings());
  expect(result.applied).toBe(true);
});

test("proxy application leaves settings unchanged when permission is missing", async () => {
  let sets = 0;
  const api = {
    permissions: {
      async contains() {
        return false;
      },
    },
    proxy: {
      settings: {
        async get() {
          return {};
        },
        async set() {
          sets++;
        },
        async clear() {},
      },
    },
  };
  const result = await applyProxy(api, proxySettings());
  expect(result.permissionRequired).toBe(true);
  expect(sets).toBe(0);
});

test("Firefox proxy status delegates active routing to the background handler", async () => {
  const api = {
    permissions: {
      async contains() {
        return true;
      },
    },
    proxy: { onRequest: {} },
  };
  const result = await applyProxy(api, proxySettings());
  expect(result.applied).toBe(false);
  expect(result.handlerRequired).toBe(true);
  expect(result.method).toBe("firefox-onRequest");
});

test("proxy disable clears our hidden contribution without changing another extension", async () => {
  let clears = 0;
  const api = {
    proxy: {
      settings: {
        async get() {
          return {
            value: { mode: "system" },
            levelOfControl: "controlled_by_other_extensions",
          };
        },
        async set() {},
        async clear() {
          clears++;
        },
      },
    },
  };
  const result = await applyProxy(api, proxySettings({ enabled: false }));
  expect(result.applied).toBe(true);
  expect(clears).toBe(1);
});

test("native privacy values release only settings controlled by this extension", async () => {
  const webrtc = browserSetting(
    "disable_non_proxied_udp",
    "controlled_by_this_extension",
    "default",
  );
  const api = { privacy: { network: { webRTCIPHandlingPolicy: webrtc } } };
  const result = await applyPrivacy(
    api,
    {
      webrtc: "native",
      fingerprinting: "native",
      language: "native",
      userAgent: "",
    },
    true,
  );
  expect(webrtc.clears).toBe(1);
  expect(webrtc.getState().levelOfControl).toBe(
    "controllable_by_this_extension",
  );
  expect(result.controls.webrtc.applied).toBe(true);
  expect(result.language.supported).toBe(false);
});
test("native privacy clear removes our hidden contribution while another extension stays effective", async () => {
  let clears = 0;
  const effective = {
    value: "default_public_interface_only",
    levelOfControl: "controlled_by_other_extensions",
  };
  const setting = {
    get: async () => effective,
    set: async () => {
      throw new Error("Must not replace another extension");
    },
    clear: async () => {
      clears++;
    },
  };
  const result = await applyPrivacy(
    { privacy: { network: { webRTCIPHandlingPolicy: setting } } },
    {
      webrtc: "native",
      fingerprinting: "native",
      language: "native",
      userAgent: "",
    },
    true,
  );
  expect(clears).toBe(1);
  expect(result.controls.webrtc.applied).toBe(true);
  expect(result.controls.webrtc.value).toBe(effective.value);
  expect(result.controls.webrtc.levelOfControl).toBe(
    "controlled_by_other_extensions",
  );
});
test("WebRTC privacy choices map to the native browser values", async () => {
  for (const [choice, expected] of [
    ["public", "default_public_interface_only"],
    ["proxy", "disable_non_proxied_udp"],
  ]) {
    const setting = browserSetting("default");
    await applyPrivacy(
      { privacy: { network: { webRTCIPHandlingPolicy: setting } } },
      {
        webrtc: choice,
        fingerprinting: "native",
        language: "native",
        userAgent: "",
      },
      true,
    );
    expect(setting.getState().value).toBe(expected);
  }
});

test("Firefox resist fingerprinting uses and reads back the native control", async () => {
  const rfp = browserSetting(false);
  const api = {
    runtime: {
      async getBrowserInfo() {
        return { name: "Firefox" };
      },
    },
    privacy: { websites: { resistFingerprinting: rfp } },
  };
  const result = await applyPrivacy(
    api,
    {
      webrtc: "native",
      fingerprinting: "resist",
      language: "native",
      userAgent: "",
    },
    true,
  );
  expect(rfp.getState().value).toBe(true);
  expect(result.controls.fingerprinting.applied).toBe(true);
});

test("Chromium rejects unsupported resist fingerprinting requests", async () => {
  await expect(
    applyPrivacy(
      { runtime: {} },
      {
        webrtc: "native",
        fingerprinting: "resist",
        language: "native",
        userAgent: "",
      },
      true,
    ),
  ).rejects.toThrow();
});

test("DNS diagnostics POST a fixed RFC 8484 example.com A query", async () => {
  const body = dnsResponse();
  await withFetch(
    async (url, options) => {
      expect(url).toBe(ENDPOINTS.sg);
      expect(options.method).toBe("POST");
      expect(options.credentials).toBe("omit");
      expect(options.referrerPolicy).toBe("no-referrer");
      expect(options.headers["content-type"]).toBe("application/dns-message");
      expect(Array.from(options.body.slice(0, 12))).toEqual([
        0xb1, 0x7d, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/dns-message" },
      });
    },
    async () => {
      const result = await testDns("sg");
      expect(result.endpoint).toBe(ENDPOINTS.sg);
      expect(result.rcode).toBe(0);
      expect(result.answers).toEqual(["93.184.216.34"]);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    },
  );
});

test("DNS diagnostics validate MIME and response identity", async () => {
  await withFetch(
    async () =>
      new Response(dnsResponse(), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    async () => {
      await expect(testDns("de")).rejects.toThrow();
    },
  );
  await withFetch(
    async () =>
      new Response(dnsResponse({ id: 0x1234 }), {
        status: 200,
        headers: { "content-type": "application/dns-message" },
      }),
    async () => {
      await expect(testDns("de")).rejects.toThrow();
    },
  );
  const badOpcode = dnsResponse({ flags: 0x8980 });
  const truncatedFlag = dnsResponse({ flags: 0x8380 });
  const noResponseFlag = dnsResponse({ flags: 0x0180 });
  const badQuestion = dnsResponse();
  badQuestion[13] = 0x66;
  const truncatedAnswer = dnsResponse().slice(0, -1);
  for (const body of [
    badOpcode,
    noResponseFlag,
    truncatedFlag,
    badQuestion,
    truncatedAnswer,
  ]) {
    await withFetch(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/dns-message" },
        }),
      async () => {
        await expect(testDns("de")).rejects.toThrow();
      },
    );
  }
});

test("DNS diagnostics returns DNS error codes without claiming browser DNS control", async () => {
  await withFetch(
    async () =>
      new Response(dnsResponse({ flags: 0x8183, answerCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/dns-message; charset=binary" },
      }),
    async () => {
      const result = await testDns("de");
      expect(result.rcode).toBe(3);
      expect(result.answers).toEqual([]);
      expect(result.message).toContain("NXDOMAIN");
    },
  );
});

test("DNS diagnostics rejects unsupported regions", async () => {
  await expect(testDns("toString")).rejects.toThrow();
});
