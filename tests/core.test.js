import { test, expect } from "bun:test";
import {
  DEFAULTS,
  DEFAULT_ADBLOCK_URL,
  validateDefaultList,
  normalizePattern,
  matchesPattern,
  validateSettings,
  isActive,
} from "../extension/core/settings.js";
import {
  parseList,
  compileRules,
  selectorsFor,
  RESOURCE_TYPES,
} from "../extension/core/rules.js";
import { cleanUrl } from "../extension/core/cleaner.js";

const defaults = () => structuredClone(DEFAULTS);
test("domain trees normalize IDNA and enforce a label boundary", () => {
  expect(normalizePattern("*.EXAMPLE.com.")).toBe("*.example.com");
  expect(normalizePattern("bücher.example")).toBe("xn--bcher-kva.example");
  for (const p of ["example.com", "*.example.com"]) {
    expect(matchesPattern(p, "example.com")).toBe(true);
    expect(matchesPattern(p, "a.example.com")).toBe(true);
    expect(matchesPattern(p, "badexample.com")).toBe(false);
    expect(matchesPattern(p, "example.com.evil.test")).toBe(false);
  }
  for (const p of [
    "https://example.com",
    "example.com:8080",
    "a;alert(1)",
    "*",
    "a/b",
  ])
    expect(() => normalizePattern(p)).toThrow();
});
test("settings import/export is bounded and strips unknown fields", () => {
  const input = defaults();
  expect(validateSettings(JSON.parse(JSON.stringify(input)))).toEqual(input);
  expect(
    validateSettings({ ...input, secret: "ignored" }).secret,
  ).toBeUndefined();
  expect(() => validateSettings({ ...input, enabled: "true" })).toThrow();
  expect(() => validateSettings({ ...input, version: 2 })).toThrow();
  expect(() =>
    validateSettings({
      ...input,
      privacy: { ...input.privacy, userAgent: "x\r\nInjected: 1" },
    }),
  ).toThrow();
  expect(() =>
    validateSettings({
      ...input,
      subscriptions: [
        { url: "http://insecure.test/list", text: "", updatedAt: "" },
      ],
    }),
  ).toThrow();
  expect(() =>
    validateSettings({
      ...input,
      proxy: { ...input.proxy, host: "proxy.test; DIRECT" },
    }),
  ).toThrow();
});
test("appearance validates overrides and preserves version-1 imports", () => {
  const old = defaults();
  delete old.theme;
  expect(validateSettings(old).theme).toBe("system");
  for (const theme of ["system", "light", "dark"])
    expect(validateSettings({ ...old, theme }).theme).toBe(theme);
  for (const theme of [null, true, "auto", "<script>"])
    expect(() => validateSettings({ ...old, theme })).toThrow();
});
test("default list cache is bounded and restricted to the fixed source", () => {
  const cache = {
    url: DEFAULT_ADBLOCK_URL,
    text: "||ads.example^",
    updatedAt: "2026-11-09T00:00:00Z",
  };
  expect(validateDefaultList(cache)).toEqual(cache);
  expect(() =>
    validateDefaultList({ ...cache, url: "https://other.example/list" }),
  ).toThrow();
  expect(() =>
    validateDefaultList({ ...cache, text: "x".repeat(4_000_001) }),
  ).toThrow();
  expect(() => validateDefaultList({ ...cache, updatedAt: true })).toThrow();
});
test("site exceptions win over enabled domain trees", () => {
  const s = {
    ...defaults(),
    mode: "sites",
    sites: ["*.example.com"],
    exceptions: ["login.example.com"],
  };
  expect(isActive(s, "www.example.com")).toBe(true);
  expect(isActive(s, "login.example.com")).toBe(false);
  expect(isActive(s, "other.test")).toBe(false);
});
test("hosts aliases and ABP exceptions retain their meaning", () => {
  const parsed = parseList(
    "0.0.0.0 ads.example tracker.example # comment\n127.0.0.1 localhost\n||foo.test^\n@@||allowed.test^\n||ads.test^$script,third-party,domain=site.test|~login.site.test",
  );
  expect(parsed.domains.sort()).toEqual([
    "ads.example",
    "foo.test",
    "tracker.example",
  ]);
  expect(parsed.allows).toEqual(["allowed.test"]);
  expect(parsed.network[0].condition).toMatchObject({
    resourceTypes: ["script"],
    domainType: "thirdParty",
    initiatorDomains: ["site.test"],
    excludedInitiatorDomains: ["login.site.test"],
  });
  expect(parsed.unsupported).toHaveLength(0);
});
test("unknown modifiers never broaden a block or allow rule", () => {
  const parsed = parseList(
    "||ads.test^$redirect=noopjs\n@@||ads.test^$unsupported\n||x.test^$script,~script\n/evil(?=test)/",
  );
  expect(parsed.unsupported).toHaveLength(4);
  expect(parsed.network).toHaveLength(0);
  expect(parsed.domains).toHaveLength(0);
  expect(parsed.allows).toHaveLength(0);
});
test("regex end anchors are not parsed as ABP modifier separators", () => {
  const parsed = parseList("/tracker$/\n/tracker$/$script");
  expect(parsed.unsupported).toHaveLength(0);
  expect(parsed.network.map((rule) => rule.condition.regexFilter)).toEqual([
    "tracker$",
    "tracker$",
  ]);
  expect(parsed.network[1].condition.resourceTypes).toEqual(["script"]);
});
test("cosmetic exceptions apply to the right domains", () => {
  const p = parseList(
    "##.advert\nexample.com##.sponsor\nexample.com#@#.advert\nexample.com##body{color:red}\nfoo.test##+js(bad)",
  );
  expect(selectorsFor(p.cosmetics, "a.example.com")).toEqual([".sponsor"]);
  expect(selectorsFor(p.cosmetics, "other.test")).toEqual([".advert"]);
  expect(p.unsupported).toHaveLength(2);
});
test("CSS comment delimiters cannot swallow later cosmetic rules", () => {
  const parsed = parseList("##.x/*\n##.x*/\n##.advert");
  expect(parsed.unsupported).toHaveLength(2);
  expect(selectorsFor(parsed.cosmetics, "example.test")).toEqual([".advert"]);
});
test.each([
  `.x[a="`,
  `.x[a='`,
  ".x(",
  ".x[",
  ".x\\",
  ".x([)]",
  ".x]",
  ".x)",
  `.x[a="\f"]`,
])("unbalanced cosmetic selector %s cannot swallow later rules", (selector) => {
  const parsed = parseList(`##${selector}\n##.advert`);
  expect(parsed.unsupported).toHaveLength(1);
  expect(selectorsFor(parsed.cosmetics, "example.test")).toEqual([".advert"]);
});
test("balanced quoted and escaped selector tokens remain supported", () => {
  const selectors = [
    `.x[data-v="("]`,
    `.x:not([data-v="]"])`,
    ".x\\[",
    `.x[data-v="a\\\"b"]`,
    ".x\\\\",
    ".x\\28",
  ];
  const parsed = parseList(
    selectors.map((selector) => `##${selector}`).join("\n"),
  );
  expect(parsed.unsupported).toHaveLength(0);
  expect(parsed.cosmetics.map((rule) => rule.selector)).toEqual(selectors);
});
test("DNR batches large host lists and covers WebSocket handshakes", () => {
  const text = Array.from({ length: 1200 }, (_, n) => `ads${n}.example`).join(
    "\n",
  );
  const result = compileRules(defaults(), [{ name: "test", text }]);
  expect(result.report.domains).toBe(1200);
  expect(result.rules.filter((r) => r.action.type === "block")).toHaveLength(3);
  expect(RESOURCE_TYPES).toContain("websocket");
  expect(new Set(result.rules.map((r) => r.id)).size).toBe(result.rules.length);
  expect(
    compileRules({ ...defaults(), enabled: false }, [{ name: "test", text }])
      .rules,
  ).toEqual([]);
  expect(
    compileRules({ ...defaults(), mode: "sites" }, [{ name: "test", text }])
      .rules,
  ).toEqual([]);
});
test("CleanURL removes known keys and preserves unrelated bytes and fragments", () => {
  expect(cleanUrl("https://example.test/?q=a%20b&utm_source=x&x=1#part")).toBe(
    "https://example.test/?q=a%20b&x=1#part",
  );
  expect(cleanUrl("https://example.test/?UTM_SOURCE=a&utm_source=b")).toBe(
    "https://example.test/",
  );
  expect(cleanUrl("https://example.test/?utm_source=x&sig=a%2Fb")).toBe(
    "https://example.test/?utm_source=x&sig=a%2Fb",
  );
  expect(cleanUrl("https://example.test/?utm_source=x&X-Amz-Signature=a")).toBe(
    "https://example.test/?utm_source=x&X-Amz-Signature=a",
  );
  expect(cleanUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  expect(cleanUrl("not a URL")).toBe("not a URL");
});
test("scope gates and header rules use distinct explicit priorities", () => {
  const s = {
    ...defaults(),
    mode: "sites",
    sites: ["*.site.test"],
    exceptions: ["login.site.test"],
    privacy: { ...DEFAULTS.privacy, language: "en-US", userAgent: "Example/1" },
  };
  const result = compileRules(s, [{ name: "test", text: "tracker.test" }]);
  expect(
    result.rules.some((r) =>
      r.condition.excludedRequestDomains?.includes("site.test"),
    ),
  ).toBe(true);
  const header = result.rules.find((r) => r.action.type === "modifyHeaders");
  expect(header.action.requestHeaders).toContainEqual({
    header: "accept-language",
    operation: "set",
    value: "en-US,en;q=0.9",
  });
  expect(result.rules.find((r) => r.priority === 20000).action.type).toBe(
    "allowAllRequests",
  );
});
test("WebSocket scheme aliases preserve the original action and resource boundary", () => {
  const result = compileRules(defaults(), [
    { name: "test", text: "@@|wss://socket.example/path$websocket,script" },
  ]);
  const original = result.rules.find(
    (rule) => rule.condition.urlFilter === "|wss://socket.example/path",
  );
  const handshake = result.rules.find(
    (rule) => rule.condition.urlFilter === "|https://socket.example/path",
  );
  expect(original.condition.resourceTypes).toEqual(["websocket", "script"]);
  expect(handshake.condition.resourceTypes).toEqual(["websocket"]);
  expect(handshake.action).toEqual(original.action);
  expect(handshake.priority).toBe(original.priority);
});
