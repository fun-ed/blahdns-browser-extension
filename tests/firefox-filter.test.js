import { test, expect } from "bun:test";
import { DEFAULTS } from "../extension/core/settings.js";
import { compileRules, RESOURCE_TYPES } from "../extension/core/rules.js";
import { createFirefoxFilter } from "../extension/core/firefox-filter.js";

const build = (text, overrides = {}) => {
  const settings = { ...structuredClone(DEFAULTS), ...overrides };
  const { rules } = compileRules(settings, [{ name: "test", text }]);
  return { rules, filter: createFirefoxFilter(rules) };
};
const action = (filter, url, type = "script", details = {}) =>
  filter.evaluate({ url, type, ...details })?.action ?? null;

test("host lists and domain anchors respect label boundaries", () => {
  const { filter } = build(
    "ads.example\n||track.test^$script\n||cdn.test/ads/\n||pre.fix",
  );
  for (const url of [
    "https://ads.example/x",
    "https://a.b.ads.example/x",
    "https://ads.example.:8443/x",
    "https://x.track.test/a.js",
    "https://track.test:8080/a.js",
    "https://sub.cdn.test/ads/x.png",
    "https://pre.fixture.test/",
  ])
    expect(action(filter, url)).toBe("block");
  for (const url of [
    "https://badads.example/",
    "https://ads.example.evil.test/",
    "https://evil.test/ads.example/",
    "https://evil.test/?u=https://ads.example/",
    "https://nottrack.test/a.js",
    "https://track.test.evil.example/a.js",
    "https://evil.test/?r=track.test",
    "https://cdn.test/adsx/x.png",
    "https://xpre.fix.test/",
    "https://pre.fix@evil.test/",
  ])
    expect(action(filter, url)).toBeNull();
  expect(action(filter, "https://track.test/a.js", "image")).toBeNull();
});

test("resource types and initiator domains include and exclude exactly", () => {
  const { filter } = build(
    "||ads.test^$script,domain=site.test|~login.site.test\n||img.test^$~image\n||ex.test^$domain=~safe.test",
  );
  const from = (originUrl, type = "script") =>
    action(filter, "https://ads.test/a.js", type, { originUrl });
  expect(from("https://site.test/")).toBe("block");
  expect(from("https://www.site.test/")).toBe("block");
  expect(from("https://login.site.test/")).toBeNull();
  expect(from("https://a.login.site.test/")).toBeNull();
  expect(from("https://othersite.test/")).toBeNull();
  expect(from(undefined)).toBeNull();
  expect(from("https://site.test/", "image")).toBeNull();
  expect(action(filter, "https://img.test/x", "script")).toBe("block");
  expect(action(filter, "https://img.test/x", "main_frame")).toBe("block");
  expect(action(filter, "https://img.test/x", "image")).toBeNull();
  // Like Firefox, a missing initiator cannot be excluded.
  expect(action(filter, "https://ex.test/x")).toBe("block");
  expect(
    action(filter, "https://ex.test/x", "script", {
      originUrl: "https://a.safe.test/",
    }),
  ).toBeNull();
});

test("URL filters follow anchors, separators, wildcards, case and regex", () => {
  const f = (text) => build(text).filter;
  const left = f("|https://left.test/ad");
  expect(action(left, "https://left.test/ad.js")).toBe("block");
  expect(action(left, "https://x.test/?u=https://left.test/ad")).toBeNull();
  const right = f("banner.gif|");
  expect(action(right, "https://a.test/banner.gif")).toBe("block");
  expect(action(right, "https://a.test/banner.gif?x=1")).toBeNull();
  const separator = f("/ads^");
  for (const url of [
    "https://a.test/ads?x",
    "https://a.test/ads",
    "https://a.test/ads/x",
  ])
    expect(action(separator, url)).toBe("block");
  for (const url of [
    "https://a.test/adsx",
    "https://a.test/ads.js",
    "https://a.test/ads%20",
    "https://a.test/ads_",
  ])
    expect(action(separator, url)).toBeNull();
  const wildcard = f("/a/*/b.js");
  expect(action(wildcard, "https://w.test/a/x/y/b.js")).toBe("block");
  expect(action(wildcard, "https://w.test/a/b.js")).toBeNull();
  const caseless = f("/AdFrame.\n/CaseOnly.$match-case");
  expect(action(caseless, "https://c.test/adframe.js")).toBe("block");
  expect(action(caseless, "https://c.test/CaseOnly.js")).toBe("block");
  expect(action(caseless, "https://c.test/caseonly.js")).toBeNull();
  const regex = f(String.raw`/\/track[0-9]+\.gif/
/\/Pix[0-9]\//$match-case`);
  expect(action(regex, "https://r.test/track42.gif")).toBe("block");
  expect(action(regex, "https://r.test/TRACK42.GIF")).toBe("block");
  expect(action(regex, "https://r.test/trackX.gif")).toBeNull();
  expect(action(regex, "https://r.test/Pix1/")).toBe("block");
  expect(action(regex, "https://r.test/pix1/")).toBeNull();
  // Wildcard parts commit to their leftmost match, so hostile filters stay linear.
  const hostile = f("a*a*a*a*a*a*a*a*a*a*a*a*b");
  const started = performance.now();
  expect(action(hostile, `https://r.test/${"a".repeat(5000)}`)).toBeNull();
  expect(performance.now() - started).toBeLessThan(1000);
  expect(action(hostile, `https://r.test/${"a".repeat(20)}b`)).toBe("block");
});

test("hostile regexFilter patterns run in linear time with RE2 semantics", () => {
  const { filter } = build(String.raw`/(a+)+$/
/(a|aa)+$/
/(a|a)*c/
/(.*a){12}x/`);
  const long = `https://r.test/${"a".repeat(30_000)}!`;
  const exact = build("/(A|AA)+$/$match-case").filter;
  const started = performance.now();
  expect(action(filter, long)).toBeNull();
  expect(action(filter, long, "xmlhttprequest")).toBeNull();
  expect(action(exact, `https://r.test/${"A".repeat(30_000)}!`)).toBeNull();
  expect(performance.now() - started).toBeLessThan(1000);
  expect(action(filter, "https://r.test/aaa")).toBe("block");
  expect(action(filter, "https://r.test/AAA")).toBe("block");
  expect(action(filter, "https://r.test/c")).toBe("block");
  expect(action(filter, `https://r.test/${"a".repeat(12)}x`)).toBe("block");
  expect(action(filter, "https://r.test/b")).toBeNull();
  expect(action(exact, "https://r.test/AAA")).toBe("block");
  expect(action(exact, "https://r.test/aaa")).toBeNull();
});

test("overlong hosts stay bounded and still match DNS-length suffixes", () => {
  const { filter } = build("ads.example\n||a*a*a*a*a*a*a*a*b");
  const labels = "a.".repeat(20_000);
  const started = performance.now();
  expect(
    action(filter, `https://${labels}ads.example/x`, "image", {
      originUrl: `https://${labels}ads.example/`,
    }),
  ).toBe("block");
  expect(
    action(filter, `https://${labels}test/${"a".repeat(20_000)}`, "image"),
  ).toBeNull();
  expect(performance.now() - started).toBeLessThan(1000);
  // Positive control: the overlong URL parses and the domain-anchored filter still matches.
  expect(
    action(filter, `https://${labels}test/${"a".repeat(20)}b`, "image"),
  ).toBe("block");
});

test("third-party classification uses the PSL with private suffixes and exact IPs", () => {
  const { filter } = build(
    "|http$third-party,image\n|http$~third-party,script",
  );
  const party = (url, originUrl) =>
    action(filter, url, "image", { originUrl }) === "block" ? "third" : "first";
  expect(
    party("https://img.example.co.uk/a", "https://www.example.co.uk/"),
  ).toBe("first");
  expect(party("https://a.co.uk/x", "https://b.co.uk/")).toBe("third");
  expect(party("https://alice.github.io/x", "https://bob.github.io/")).toBe(
    "third",
  );
  expect(
    party("https://cdn.alice.github.io/x", "https://alice.github.io/"),
  ).toBe("first");
  expect(party("http://192.168.1.1/x", "http://192.168.1.1:8080/")).toBe(
    "first",
  );
  expect(party("http://192.168.1.1/x", "http://10.168.1.1/")).toBe("third");
  expect(party("http://[::1]/x", "http://[::1]/")).toBe("first");
  // Firefox treats a missing initiator as third party.
  expect(party("https://ads.test/x", undefined)).toBe("third");
  expect(
    action(filter, "https://cdn.example.co.uk/a.js", "script", {
      originUrl: "https://www.example.co.uk/",
    }),
  ).toBe("block");
  expect(
    action(filter, "https://a.co.uk/a.js", "script", {
      originUrl: "https://b.co.uk/",
    }),
  ).toBeNull();
});

test("allow and important rules keep native priority", () => {
  const { rules, filter } = build(
    "||ads.test^\n@@||ads.test^$script\n||ads.test/x.js$important,script\n@@||safe.ads.test^",
  );
  const domain = rules.find((r) =>
    r.condition.requestDomains?.includes("ads.test"),
  ).id;
  const important = rules.find((r) => r.priority === 50).id;
  expect(
    filter.evaluate({ url: "https://ads.test/i.png", type: "image" }),
  ).toEqual({
    action: "block",
    ruleId: domain,
  });
  expect(action(filter, "https://ads.test/a.js")).toBeNull();
  expect(action(filter, "https://safe.ads.test/i.png", "image")).toBeNull();
  for (const url of ["https://ads.test/x.js", "https://safe.ads.test/x.js"])
    expect(filter.evaluate({ url, type: "script" })).toEqual({
      action: "block",
      ruleId: important,
    });
});

test("equal priorities use native action precedence, then the lower rule ID", () => {
  const filter = createFirefoxFilter([
    {
      id: 1,
      priority: 5,
      action: { type: "block" },
      condition: { requestDomains: ["x.test"] },
    },
    {
      id: 2,
      priority: 5,
      action: { type: "allow" },
      condition: { urlFilter: "||x.test/ok" },
    },
    {
      id: 3,
      priority: 5,
      action: {
        type: "redirect",
        redirect: { transform: { queryTransform: { removeParams: ["a"] } } },
      },
      condition: { urlFilter: "a=", resourceTypes: ["sub_frame"] },
    },
    {
      id: 4,
      priority: 5,
      action: { type: "block" },
      condition: { urlFilter: "/dup", resourceTypes: ["script"] },
    },
  ]);
  const run = (url, type) => filter.evaluate({ url, type });
  expect(run("https://x.test/ok.js", "script")).toBeNull();
  expect(run("https://x.test/dup.js", "script")).toEqual({
    action: "block",
    ruleId: 1,
  });
  expect(run("https://x.test/f?a=1", "sub_frame")).toEqual({
    action: "block",
    ruleId: 1,
  });
  expect(run("https://y.test/f?a=1&b=2", "sub_frame")).toEqual({
    action: "redirect",
    ruleId: 3,
    redirectUrl: "https://y.test/f?b=2",
  });
  // Without resourceTypes, DNR ignores main_frame requests.
  expect(run("https://x.test/", "main_frame")).toBeNull();
});

test("sites mode inherits allowance through frames and scopes workers by initiator", () => {
  const { filter } = build("tracker.test", {
    mode: "sites",
    sites: ["site.test"],
  });
  const tracker = "https://tracker.test/t.js";
  const frame = "https://site.test/frame";
  expect(
    action(filter, tracker, "script", {
      originUrl: "https://site.test/",
      documentUrl: "https://site.test/",
      frameAncestors: [],
    }),
  ).toBe("block");
  expect(
    action(filter, tracker, "script", {
      originUrl: "https://other.test/",
      documentUrl: "https://other.test/",
      frameAncestors: [],
    }),
  ).toBeNull();
  // A site iframe inside a page outside the list inherits the top document's allowance.
  expect(
    action(filter, tracker, "script", {
      originUrl: frame,
      documentUrl: frame,
      frameAncestors: [{ url: "https://other.test/", frameId: 0 }],
    }),
  ).toBeNull();
  expect(
    action(filter, "https://tracker.test/frame", "sub_frame", {
      originUrl: "https://site.test/",
      documentUrl: "https://site.test/",
      frameAncestors: [{ url: "https://site.test/", frameId: 0 }],
    }),
  ).toBe("block");
  expect(
    action(filter, "https://tracker.test/frame", "sub_frame", {
      originUrl: "https://other.test/",
      documentUrl: "https://other.test/",
      frameAncestors: [{ url: "https://other.test/", frameId: 0 }],
    }),
  ).toBeNull();
  // Missing ancestry falls back to the tab URL supplied by the caller.
  const partial = {
    url: tracker,
    type: "script",
    originUrl: frame,
    documentUrl: frame,
  };
  expect(filter.evaluate(partial, "https://other.test/")).toBeNull();
  expect(filter.evaluate(partial)?.action).toBe("block");
  // Workers have no frame inheritance; their initiator decides.
  const worker = (originUrl) =>
    action(filter, tracker, "xmlhttprequest", {
      originUrl,
      tabId: -1,
      frameId: -1,
    });
  expect(worker("https://other.test/sw.js")).toBeNull();
  expect(worker("https://site.test/sw.js")).toBe("block");
  expect(action(filter, "https://tracker.test/", "main_frame")).toBeNull();
});

test("paused pages allow their frames, nested iframes and workers over important rules", () => {
  const { filter } = build("tracker.test\n||tracker.test^$important", {
    exceptions: ["paused.test"],
  });
  const tracker = "https://tracker.test/t.js";
  const paused = "https://www.paused.test/";
  const top = [{ url: paused, frameId: 0 }];
  expect(
    action(filter, tracker, "script", {
      originUrl: paused,
      documentUrl: paused,
      frameAncestors: [],
    }),
  ).toBeNull();
  expect(
    action(filter, "https://tracker.test/frame", "sub_frame", {
      originUrl: paused,
      documentUrl: paused,
      frameAncestors: top,
    }),
  ).toBeNull();
  const inFrame = (frameAncestors) =>
    action(filter, tracker, "script", {
      originUrl: "https://tracker.test/frame",
      documentUrl: "https://tracker.test/frame",
      frameAncestors,
    });
  expect(inFrame(top)).toBeNull();
  expect(inFrame([{ url: "https://news.test/", frameId: 0 }])).toBe("block");
  const worker = (originUrl) =>
    action(filter, tracker, "xmlhttprequest", { originUrl, tabId: -1 });
  expect(worker("https://paused.test/sw.js")).toBeNull();
  expect(worker("https://news.test/sw.js")).toBe("block");
  expect(
    action(filter, "https://paused.test/?utm_source=x", "main_frame"),
  ).toBeNull();
});

test("main frame navigations are blocked by host lists", () => {
  const { filter } = build("tracker.test");
  expect(action(filter, "https://tracker.test/", "main_frame")).toBe("block");
  expect(
    action(filter, "https://www.tracker.test/p", "main_frame", {
      originUrl: "https://news.test/",
    }),
  ).toBe("block");
  expect(action(filter, "https://news.test/", "main_frame")).toBeNull();
  expect(
    build("tracker.test", { enabled: false }).filter.evaluate({
      url: "https://tracker.test/",
      type: "main_frame",
    }),
  ).toBeNull();
});

test("tracking redirects keep signed URLs, lose to blocks and preserve query bytes", () => {
  const { rules, filter } = build("tracker.test");
  const redirects = rules
    .filter((r) => r.action.type === "redirect")
    .map((r) => r.id);
  const nav = (url, type = "main_frame") => filter.evaluate({ url, type });
  const cleaned = nav(
    "https://shop.test/p?q=a%20b+c&utm_source=x&x=%2F&UTM_SOURCE=y&fbclid=z&e=#frag",
  );
  expect(cleaned.action).toBe("redirect");
  expect(redirects).toContain(cleaned.ruleId);
  expect(cleaned.redirectUrl).toBe(
    "https://shop.test/p?q=a%20b+c&x=%2F&UTM_SOURCE=y&e=#frag",
  );
  expect(nav("https://shop.test/p?utm_source=x&gclid=y#frag").redirectUrl).toBe(
    "https://shop.test/p#frag",
  );
  expect(nav("https://shop.test/p?utm_source=x", "sub_frame").redirectUrl).toBe(
    "https://shop.test/p",
  );
  expect(nav("https://shop.test/p?utm_source=x", "script")).toBeNull();
  // A transform that changes nothing is a no-op, as in Firefox.
  expect(nav("https://shop.test/a&utm_source=x")).toBeNull();
  expect(nav("https://shop.test/p#?utm_source=x")).toBeNull();
  expect(nav("https://shop.test/p?utm_source=x&sig=abc")).toBeNull();
  expect(nav("https://s3.test/o?utm_source=x&X-Amz-Signature=a")).toBeNull();
  expect(nav("https://tracker.test/?utm_source=x").action).toBe("block");
  expect(nav("https://tracker.test/?utm_source=x&sig=a").action).toBe("block");
  expect(
    build("", { cleanUrls: false }).filter.evaluate({
      url: "https://shop.test/p?utm_source=x",
      type: "main_frame",
    }),
  ).toBeNull();
});

test("WebSocket rules match Firefox handshake URLs only for WebSocket requests", () => {
  const { filter } = build(
    "|wss://socket.example/path$websocket\n@@|wss://socket.example/path/ok$websocket",
  );
  expect(action(filter, "wss://socket.example/path", "websocket")).toBe(
    "block",
  );
  expect(action(filter, "https://socket.example/path", "websocket")).toBe(
    "block",
  );
  expect(
    action(filter, "https://socket.example/path", "xmlhttprequest"),
  ).toBeNull();
  expect(
    action(filter, "https://socket.example/path/ok", "websocket"),
  ).toBeNull();
  expect(action(filter, "http://socket.example/path", "websocket")).toBeNull();
});

test("Firefox-only request types follow Chromium's resource type mapping", () => {
  const mapped = {
    beacon: "ping",
    imageset: "image",
    object_subrequest: "object",
    json: "script",
    xslt: "stylesheet",
    web_manifest: "other",
    xml_dtd: "other",
    speculative: "other",
  };
  const types = [...new Set(Object.values(mapped))];
  const { filter } = build(types.map((t) => `||${t}.test^$${t}`).join("\n"));
  for (const [firefox, chromium] of Object.entries(mapped))
    for (const type of types)
      expect(action(filter, `https://${type}.test/x`, firefox)).toBe(
        type === chromium ? "block" : null,
      );
  expect(action(filter, "https://image.test/x", "image")).toBe("block");
  expect(
    filter.evaluate({ url: "data:text/plain,x", type: "image" }),
  ).toBeNull();
  expect(filter.evaluate({})).toBeNull();
});

test("unsupported rules are rejected before they can be applied", () => {
  const base = {
    id: 1,
    priority: 1,
    action: { type: "block" },
    condition: { urlFilter: "ads" },
  };
  const redirect = (redirect) => ({
    ...base,
    action: { type: "redirect", redirect },
  });
  const cases = [
    [
      { ...base, condition: { urlFilter: "ads", requestMethods: ["get"] } },
      /requestMethods/,
    ],
    [{ ...base, condition: { tabIds: [1] } }, /tabIds/],
    [{ ...base, action: { type: "upgradeScheme" } }, /upgradeScheme/],
    [redirect({ url: "https://x.test/" }), /removeParams/],
    [
      redirect({
        transform: {
          queryTransform: { removeParams: ["a"], addOrReplaceParams: [] },
        },
      }),
      /removeParams/,
    ],
    [
      {
        ...base,
        action: { type: "allowAllRequests" },
        condition: { resourceTypes: ["script"] },
      },
      /allowAllRequests/,
    ],
    [{ ...base, condition: { resourceTypes: ["beacon"] } }, /resourceTypes/],
    [{ ...base, condition: { urlFilter: "/广告/" } }, /ASCII/],
    [{ ...base, condition: { urlFilter: "||*x" } }, /\|\|\*/],
    [{ ...base, condition: { regexFilter: "(" } }, /regexFilter/],
    [
      { ...base, condition: { urlFilter: "a", regexFilter: "a" } },
      /mutually exclusive/,
    ],
    [{ ...base, condition: { domainType: "sameSite" } }, /domainType/],
    [{ ...base, condition: { requestDomains: [] } }, /requestDomains/],
    [
      { ...base, condition: { requestDomains: [`${"a.".repeat(127)}test`] } },
      /requestDomains/,
    ],
    [{ ...base, condition: { regexFilter: "a{1001}" } }, /RE2/],
  ];
  for (const [rule, message] of cases)
    expect(() => createFirefoxFilter([rule])).toThrow(message);
  expect(() => createFirefoxFilter([base, base])).toThrow(/duplicate/);
  expect(() => createFirefoxFilter("rules")).toThrow();
  expect(() => build("/广告/")).toThrow(/ASCII/);
  // JS accepts this but RE2 does not; the whole compile fails visibly instead of dropping the rule.
  expect(() => build("/a{1001}/")).toThrow(/RE2/);
  // Header rules stay native and are validated but never block.
  const headers = build("", {
    privacy: { ...DEFAULTS.privacy, language: "en-US" },
  });
  expect(headers.rules.some((r) => r.action.type === "modifyHeaders")).toBe(
    true,
  );
  expect(action(headers.filter, "https://x.test/")).toBeNull();
});

test("hundreds of thousands of host domains are indexed by label", () => {
  const rules = [];
  for (let i = 0; i < 430_000; i += 500)
    rules.push({
      id: rules.length + 1,
      priority: 30,
      action: { type: "block" },
      condition: {
        requestDomains: Array.from(
          { length: 500 },
          (_, n) => `ads${i + n}.example`,
        ),
        resourceTypes: RESOURCE_TYPES,
      },
    });
  const filter = createFirefoxFilter(rules);
  expect(
    filter.evaluate({ url: "https://cdn.ads429999.example/x", type: "image" }),
  ).toEqual({
    action: "block",
    ruleId: rules.length,
  });
  expect(
    filter.evaluate({ url: "https://ads430000.example/x", type: "image" }),
  ).toBeNull();
  expect(
    filter.evaluate({ url: "https://xads1.example/x", type: "image" }),
  ).toBeNull();
});

test("IPv6 domain-anchor filters bypass hostname-only indexing", () => {
  const { filter } = build("||[2001:db8::1]^$script");
  expect(action(filter, "https://[2001:db8::1]/ad.js")).toBe("block");
  expect(action(filter, "https://[2001:db8::1]:8443/ad.js")).toBe("block");
  expect(action(filter, "https://[2001:db8::2]/ad.js")).toBeNull();
  expect(action(filter, "https://[2001:db8::1]/ad.png", "image")).toBeNull();
});
