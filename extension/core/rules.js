import { normalizeHost, matchesPattern } from "./settings.js";
import { TRACKING_PARAMS, SIGNED_KEYS } from "./cleaner.js";

export const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other",
];
const TYPE_MAP = {
  document: "main_frame",
  subdocument: "sub_frame",
  stylesheet: "stylesheet",
  script: "script",
  image: "image",
  font: "font",
  object: "object",
  xmlhttprequest: "xmlhttprequest",
  ping: "ping",
  media: "media",
  websocket: "websocket",
  other: "other",
};
const root = (p) => p.replace(/^\*\./, "");

function hasBalancedSelectorTokens(selector) {
  const closers = [];
  let quote = "";
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (/[\r\n\f]/.test(char)) return false;
    if (char === "\\") {
      if (++i >= selector.length || /[\r\n\f]/.test(selector[i])) return false;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[") closers.push("]");
    else if (char === "(") closers.push(")");
    else if ((char === "]" || char === ")") && closers.pop() !== char)
      return false;
  }
  return !quote && closers.length === 0;
}

export function parseList(text, source = "custom") {
  const domains = new Set(),
    allows = new Set(),
    network = [],
    cosmetics = [],
    unsupported = [];
  let ignored = 0,
    accepted = 0;
  const reject = (line, reason) => unsupported.push({ line, reason, source });
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(?:!|#(?!#|@)|\[Adblock)/.test(line)) {
      ignored++;
      continue;
    }
    if (line.length > 2048) {
      reject(line.slice(0, 120), "Rule exceeds 2048 characters");
      continue;
    }
    const cosmetic = line.match(/^(.*?)#(@?)#(.+)$/);
    if (cosmetic) {
      const [, scope, exception, selector] = cosmetic;
      if (
        /[{}@]|\/\*|\*\/|url\s*\(|\+js\(|:style\(|:remove\(|:matches-|:has-text\(|:xpath\(/i.test(
          selector,
        ) ||
        selector.length > 500 ||
        !hasBalancedSelectorTokens(selector)
      ) {
        reject(line, "Procedural or injected cosmetic rules are not supported");
        continue;
      }
      try {
        const include = [],
          exclude = [];
        for (const host of scope ? scope.split(",") : [])
          (host.startsWith("~") ? exclude : include).push(
            normalizeHost(host.replace(/^~/, "")),
          );
        cosmetics.push({ include, exclude, selector, exception: !!exception });
        accepted++;
      } catch {
        reject(line, "Invalid cosmetic domain");
      }
      continue;
    }
    if (/#\$#|#%#|#\?#|\+js\(|^\/\//.test(line)) {
      reject(line, "Scriptlets and extended CSS are not supported");
      continue;
    }
    const hosts = line.replace(/\s+#.*$/, "").split(/\s+/);
    if (/^(?:0\.0\.0\.0|127\.0\.0\.1|::|::1)$/.test(hosts[0])) {
      try {
        const entries = hosts
          .slice(1)
          .map(normalizeHost)
          .filter((h) => h !== "localhost" && !h.endsWith(".localhost"));
        if (!entries.length) {
          ignored++;
          continue;
        }
        entries.forEach((h) => domains.add(h));
        accepted += entries.length;
      } catch {
        reject(line, "Invalid hosts entry");
      }
      continue;
    }
    try {
      if (
        !line.includes("/") &&
        !line.includes("$") &&
        !line.includes("|") &&
        !line.includes("^") &&
        !line.includes("*") &&
        line.includes(".")
      ) {
        domains.add(normalizeHost(line));
        accepted++;
        continue;
      }
    } catch {
      /* Continue as ABP, never reinterpret malformed hosts. */
    }
    let pattern = line,
      allow = false;
    if (pattern.startsWith("@@")) {
      allow = true;
      pattern = pattern.slice(2);
    }
    const lastDollar = pattern.lastIndexOf("$");
    const dollar =
      pattern.startsWith("/") && lastDollar < pattern.lastIndexOf("/")
        ? -1
        : lastDollar;
    const modifiers = dollar >= 0 ? pattern.slice(dollar + 1).split(",") : [];
    if (dollar >= 0) pattern = pattern.slice(0, dollar);
    const condition = {},
      includes = [],
      excludes = [];
    let invalid = "",
      important = false;
    for (const modifier of modifiers) {
      const negative = modifier.startsWith("~"),
        name = negative ? modifier.slice(1) : modifier;
      if (TYPE_MAP[name]) (negative ? excludes : includes).push(TYPE_MAP[name]);
      else if (name === "third-party" || name === "3p")
        condition.domainType = negative ? "firstParty" : "thirdParty";
      else if (name === "match-case" && !negative)
        condition.isUrlFilterCaseSensitive = true;
      else if (name === "important" && !negative && !allow) important = true;
      else if (name.startsWith("domain=") && !negative) {
        try {
          for (const host of name.slice(7).split("|")) {
            const field = host.startsWith("~")
              ? "excludedInitiatorDomains"
              : "initiatorDomains";
            (condition[field] ??= []).push(
              normalizeHost(host.replace(/^~/, "")),
            );
          }
        } catch {
          invalid = "Invalid domain modifier";
        }
      } else invalid = `Unsupported modifier: ${modifier}`;
    }
    if (!pattern || /\s/.test(pattern)) invalid = "Invalid URL filter";
    if (invalid) {
      reject(line, invalid);
      continue;
    }
    condition.resourceTypes = (
      includes.length ? [...new Set(includes)] : RESOURCE_TYPES
    ).filter((t) => !excludes.includes(t));
    if (!condition.resourceTypes.length) {
      reject(line, "Empty resource type set");
      continue;
    }
    const pure = pattern.match(/^\|\|([^/*^|]+)\^$/);
    if (pure && !modifiers.length) {
      try {
        (allow ? allows : domains).add(normalizeHost(pure[1]));
        accepted++;
        continue;
      } catch {
        reject(line, "Invalid domain");
        continue;
      }
    }
    if (pattern.startsWith("/") && pattern.endsWith("/")) {
      const regex = pattern.slice(1, -1);
      if (/\(\?[=!<]|\\[1-9]/.test(regex)) {
        reject(line, "DNR RE2 does not support lookaround or backreferences");
        continue;
      }
      try {
        new RegExp(regex);
      } catch {
        reject(line, "Invalid regular expression");
        continue;
      }
      condition.regexFilter = regex;
    } else condition.urlFilter = pattern;
    network.push({
      priority: important ? 50 : allow ? 40 : 30,
      action: { type: allow ? "allow" : "block" },
      condition,
    });
    accepted++;
  }
  return {
    domains: [...domains],
    allows: [...allows],
    network,
    cosmetics,
    unsupported,
    ignored,
    accepted,
  };
}

export function selectorsFor(cosmetics, hostname) {
  const applicable = cosmetics.filter(
    (r) =>
      (!r.include.length ||
        r.include.some((p) => matchesPattern(p, hostname))) &&
      !r.exclude.some((p) => matchesPattern(p, hostname)),
  );
  const except = new Set(
    applicable.filter((r) => r.exception).map((r) => r.selector),
  );
  return [
    ...new Set(
      applicable
        .filter((r) => !r.exception && !except.has(r.selector))
        .map((r) => r.selector),
    ),
  ];
}

export function compileRules(settings, sources = []) {
  const all = sources.map((s) => parseList(s.text, s.name));
  const rules = [],
    cosmetics = all.flatMap((x) => x.cosmetics);
  const report = {
    rules: 0,
    domains: 0,
    cosmetic: cosmetics.length,
    unsupported: all.flatMap((x) => x.unsupported),
    ignored: all.reduce((n, x) => n + x.ignored, 0),
    accepted: all.reduce((n, x) => n + x.accepted, 0),
  };
  const add = (priority, action, condition) =>
    rules.push({ id: rules.length + 1, priority, action, condition });
  if (!settings.enabled) return { rules, cosmetics: [], report };
  const roots = [...new Set(settings.sites.map(root))],
    exceptions = [...new Set(settings.exceptions.map(root))];
  if (settings.mode === "sites" && !roots.length)
    return { rules, cosmetics: [], report };
  if (settings.mode === "sites") {
    add(
      10000,
      { type: "allowAllRequests" },
      { excludedRequestDomains: roots, resourceTypes: ["main_frame"] },
    );
    // Workers have no frame inheritance; limit those requests by their initiating domain as well.
    add(
      9000,
      { type: "allow" },
      {
        excludedInitiatorDomains: roots,
        resourceTypes: RESOURCE_TYPES.filter(
          (t) => !["main_frame", "sub_frame"].includes(t),
        ),
      },
    );
  }
  if (exceptions.length) {
    add(
      20000,
      { type: "allowAllRequests" },
      { requestDomains: exceptions, resourceTypes: ["main_frame"] },
    );
    add(
      20000,
      { type: "allow" },
      { initiatorDomains: exceptions, resourceTypes: RESOURCE_TYPES },
    );
  }
  const domains = [...new Set(all.flatMap((x) => x.domains))].sort();
  report.domains = domains.length;
  for (let i = 0; i < domains.length; i += 500)
    add(
      30,
      { type: "block" },
      {
        requestDomains: domains.slice(i, i + 500),
        resourceTypes: RESOURCE_TYPES,
      },
    );
  const allows = [...new Set(all.flatMap((x) => x.allows))].sort();
  for (let i = 0; i < allows.length; i += 500)
    add(
      40,
      { type: "allow" },
      {
        requestDomains: allows.slice(i, i + 500),
        resourceTypes: RESOURCE_TYPES,
      },
    );
  for (const rule of all.flatMap((entry) => entry.network)) {
    add(rule.priority, rule.action, rule.condition);
    if (
      /^\|?wss?:\/\//.test(rule.condition.urlFilter ?? "") &&
      rule.condition.resourceTypes.includes("websocket")
    ) {
      // Firefox matches the HTTP(S) handshake URL for WebSocket requests.
      add(rule.priority, rule.action, {
        ...rule.condition,
        urlFilter: rule.condition.urlFilter.replace(/^(\|?)ws/, "$1http"),
        resourceTypes: ["websocket"],
      });
    }
  }
  if (settings.cleanUrls) {
    add(
      15,
      { type: "allow" },
      {
        regexFilter: `[?&](${SIGNED_KEYS.join("|")})=`,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame", "sub_frame"],
      },
    );
    // Keep each RE2 expression below Chromium's compiled-size limit.
    for (const parameter of TRACKING_PARAMS) {
      add(
        10,
        {
          type: "redirect",
          redirect: {
            transform: { queryTransform: { removeParams: TRACKING_PARAMS } },
          },
        },
        {
          regexFilter: `[?&]${parameter}=`,
          isUrlFilterCaseSensitive: true,
          resourceTypes: ["main_frame", "sub_frame"],
        },
      );
    }
  }
  const headers = [];
  if (settings.privacy.language === "en-US")
    headers.push({
      header: "accept-language",
      operation: "set",
      value: "en-US,en;q=0.9",
    });
  if (settings.privacy.userAgent)
    headers.push({
      header: "user-agent",
      operation: "set",
      value: settings.privacy.userAgent,
    });
  if (headers.length)
    add(
      20,
      { type: "modifyHeaders", requestHeaders: headers },
      { urlFilter: "|http", resourceTypes: RESOURCE_TYPES },
    );
  report.rules = rules.length;
  if (rules.length > 4500)
    throw new Error(
      `Compiled ${rules.length} rules. The cross-browser limit is 4500. Reduce the list size.`,
    );
  if (rules.filter((r) => r.condition.regexFilter).length > 900)
    throw new Error(
      "More than 900 regular expression rules. Reduce the list size.",
    );
  return { rules, cosmetics, report };
}
