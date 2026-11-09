import { getDomain } from "tldts";
import { RE2JS } from "re2js";
import { RESOURCE_TYPES } from "./rules.js";

// Firefox ExtensionDNR semantics for compiled block/redirect rules, evaluated from webRequest.
// Equal priority falls back to native action precedence, then the lower rule ID.
// regexFilter uses linear-time RE2 (the syntax compileRules targets), never backtracking JS RegExp.
const RANK = { allow: 1, allowAllRequests: 2, block: 3, redirect: 5 };
const CONDITIONS = new Set([
  "resourceTypes",
  "requestDomains",
  "excludedRequestDomains",
  "initiatorDomains",
  "excludedInitiatorDomains",
  "domainType",
  "urlFilter",
  "regexFilter",
  "isUrlFilterCaseSensitive",
]);
const DOMAIN_LISTS = [
  "requestDomains",
  "excludedRequestDomains",
  "initiatorDomains",
  "excludedInitiatorDomains",
];
// Firefox-only webRequest types, mapped like Chromium's ToWebRequestResourceType so the compiled
// rule types keep their cross-browser meaning (sendBeacon is a keepalive ping, JSON modules are scripts).
const TYPE_ALIASES = new Map([
  ["beacon", "ping"],
  ["imageset", "image"],
  ["object_subrequest", "object"],
  ["json", "script"],
  ["xslt", "stylesheet"],
  ["web_manifest", "other"],
  ["xml_dtd", "other"],
  ["speculative", "other"],
]);
const SEPARATOR = "[^A-Za-z0-9_\\-.%]";
// Scheme, then userinfo up to the last "@" in the authority, committed so it is scanned once.
const AUTHORITY = "^[^:]*:\\/\\/(?=((?:[^/]*@)?))\\1";
// Longest DNS name; longer host suffixes can never equal a rule domain.
const MAX_DOMAIN = 253;
const PSL = { allowPrivateDomains: true, extractHostname: false };

const cmp = (a, b) => b.priority - a.priority || a.rank - b.rank || a.id - b.id;
const hit = (set, domains) => domains.some((domain) => set.has(domain));
const registrable = (host) => getDomain(host, PSL) ?? host;
const only = (value, key) =>
  value && typeof value === "object" && Object.keys(value).join() === key
    ? value[key]
    : undefined;

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Only the full host and DNS-length suffixes can match, so hostile hosts with many labels stay linear.
function superdomains(host) {
  const domains = [host];
  for (
    let i = host.indexOf(".", Math.max(0, host.length - MAX_DOMAIN - 1));
    i >= 0;
    i = host.indexOf(".", i + 1)
  )
    domains.push(host.slice(i + 1));
  return domains;
}

// Wildcard parts commit to their leftmost match like Firefox, so hostile filters cannot backtrack exponentially.
function urlFilterRegex(filter, caseSensitive) {
  let start = 0,
    end = filter.length,
    anchor = "left",
    right = false;
  if (filter.startsWith("||")) [start, anchor] = [2, "domain"];
  else if (filter[0] === "|") start = 1;
  else anchor = "";
  if (end > start && filter[end - 1] === "|") [end, right] = [end - 1, true];
  while (start < end && filter[start] === "*")
    [start, anchor] = [start + 1, ""];
  while (end > start && filter[end - 1] === "*")
    [end, right] = [end - 1, false];
  const parts = filter
    .slice(start, end)
    .split("*")
    .map((part, i, all) =>
      [...part]
        .map((c, j) =>
          c !== "^"
            ? c.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&")
            : i === all.length - 1 && j === part.length - 1
              ? `(?:${SEPARATOR}|$)`
              : SEPARATOR,
        )
        .join(""),
    );
  let source = anchor === "domain" ? AUTHORITY : "^",
    group = anchor === "domain" ? 1 : 0;
  parts.forEach((part, i) => {
    const tail = i === parts.length - 1 && right;
    if (i === 0 && anchor === "left") source += tail ? `${part}$` : part;
    else if (i === 0 && anchor === "domain")
      // Firefox commits to the first label where the head matches; a lone right-anchored part may use any label.
      source += tail
        ? `(?:[^/]*\\.)?${part}$`
        : `(?=((?:[^/]*?\\.)??${part}))\\${++group}`;
    else
      source += tail
        ? `[\\s\\S]*${part}$`
        : `(?=([\\s\\S]*?${part}))\\${++group}`;
  });
  return new RegExp(source, caseSensitive ? "" : "i");
}

function compile(rule, seen) {
  const fail = (reason) => {
    throw new Error(`Firefox filter rule ${rule?.id}: ${reason}.`);
  };
  if (!Number.isInteger(rule?.id) || rule.id < 1 || seen.has(rule.id))
    fail("invalid or duplicate rule ID");
  seen.add(rule.id);
  const { priority = 1, action, condition } = rule;
  const type = action?.type;
  if (!Number.isInteger(priority) || priority < 1) fail("invalid priority");
  if (!Object.hasOwn(RANK, type) && type !== "modifyHeaders")
    fail(`unsupported action ${type}`);
  if (!condition || typeof condition !== "object") fail("missing condition");
  for (const key of Object.keys(condition))
    if (!CONDITIONS.has(key)) fail(`unsupported condition ${key}`);
  const {
    resourceTypes,
    urlFilter,
    regexFilter,
    domainType,
    isUrlFilterCaseSensitive: caseSensitive = false,
  } = condition;
  if (
    resourceTypes !== undefined &&
    (!Array.isArray(resourceTypes) ||
      !resourceTypes.length ||
      resourceTypes.some((t) => !RESOURCE_TYPES.includes(t)))
  )
    fail("invalid resourceTypes");
  if (
    type === "allowAllRequests" &&
    !resourceTypes?.every((t) => t === "main_frame" || t === "sub_frame")
  )
    fail("allowAllRequests requires main_frame/sub_frame resourceTypes");
  for (const key of DOMAIN_LISTS) {
    const list = condition[key];
    if (
      list !== undefined &&
      (!Array.isArray(list) ||
        !list.length ||
        list.some((d) => typeof d !== "string" || !d || d.length > MAX_DOMAIN))
    )
      fail(`invalid ${key}`);
  }
  if (![undefined, "firstParty", "thirdParty"].includes(domainType))
    fail("invalid domainType");
  if (typeof caseSensitive !== "boolean")
    fail("invalid isUrlFilterCaseSensitive");
  if (urlFilter !== undefined && regexFilter !== undefined)
    fail("urlFilter and regexFilter are mutually exclusive");
  const pattern = urlFilter ?? regexFilter;
  if (
    pattern !== undefined &&
    (typeof pattern !== "string" || !pattern || /[^\x00-\x7f]/.test(pattern))
  )
    fail("URL filters must be non-empty ASCII");
  if (urlFilter?.startsWith("||*")) fail("urlFilter must not start with ||*");
  let filter = null;
  try {
    if (urlFilter !== undefined)
      filter = urlFilterRegex(urlFilter, caseSensitive);
    else if (regexFilter !== undefined)
      filter = RE2JS.compile(
        regexFilter,
        caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE,
      );
  } catch {
    fail("invalid regexFilter (RE2 syntax required)");
  }
  let removeParams = null;
  if (type === "redirect") {
    const names = only(
      only(only(action.redirect, "transform"), "queryTransform"),
      "removeParams",
    );
    if (
      !Array.isArray(names) ||
      !names.length ||
      names.some((name) => typeof name !== "string" || !name)
    )
      fail("only redirect.transform.queryTransform.removeParams is supported");
    // Firefox compares raw query keys with form-urlencoded names.
    removeParams = new Set(
      names.map((s) => new URLSearchParams({ s }).toString().slice(2)),
    );
  }
  const set = (key) => (condition[key] ? new Set(condition[key]) : null);
  return {
    id: rule.id,
    priority,
    rank: RANK[type],
    action: type,
    caseSensitive,
    types: new Set(
      resourceTypes ?? RESOURCE_TYPES.filter((t) => t !== "main_frame"),
    ),
    filter,
    excludedRequestDomains: set("excludedRequestDomains"),
    initiatorDomains: set("initiatorDomains"),
    excludedInitiatorDomains: set("excludedInitiatorDomains"),
    domainType,
    removeParams,
  };
}

function request(url, type, initiatorUrl) {
  const target = typeof url === "string" && parse(url);
  if (!target || !/^(?:https?|wss?):$/.test(target.protocol)) return null;
  const host = target.hostname.replace(/\.$/, "");
  const from = parse(initiatorUrl)?.hostname.replace(/\.$/, "") || null;
  return {
    url,
    type,
    domains: superdomains(host),
    initiators: from && superdomains(from),
    // Firefox treats a missing initiator (typed navigation, opaque origin) as third party.
    domainType:
      from && (from === host || registrable(from) === registrable(host))
        ? "firstParty"
        : "thirdParty",
  };
}

function matches(rule, q) {
  return (
    rule.types.has(q.type) &&
    (!rule.filter || rule.filter.test(q.url)) &&
    !(
      rule.excludedRequestDomains && hit(rule.excludedRequestDomains, q.domains)
    ) &&
    // Firefox cannot exclude a missing initiator, but requires one for initiatorDomains.
    !(
      rule.excludedInitiatorDomains &&
      q.initiators &&
      hit(rule.excludedInitiatorDomains, q.initiators)
    ) &&
    (!rule.initiatorDomains ||
      (!!q.initiators && hit(rule.initiatorDomains, q.initiators))) &&
    (!rule.domainType || rule.domainType === q.domainType)
  );
}

// Documents from the request's frame up to the top, as Firefox rebuilds them for allowAllRequests.
function ancestors(details, topUrl) {
  if (details.type === "main_frame") return [];
  // documentUrl is the requesting frame, or the parent that also heads frameAncestors for sub_frame.
  const chain = [];
  for (const url of [
    details.documentUrl,
    ...(Array.isArray(details.frameAncestors)
      ? details.frameAncestors.map((frame) => frame?.url)
      : []),
    topUrl,
  ])
    if (typeof url === "string" && url !== chain.at(-1)) chain.push(url);
  return chain
    .map((url, i) =>
      request(
        url,
        i === chain.length - 1 ? "main_frame" : "sub_frame",
        chain[i + 1],
      ),
    )
    .filter(Boolean);
}

function stripParams(url, names) {
  const hash = url.indexOf("#"),
    end = hash < 0 ? url.length : hash,
    query = url.indexOf("?");
  if (query < 0 || query > end) return url;
  const parts = url.slice(query + 1, end).split("&");
  const kept = parts.filter((part) => !names.has(part.split("=", 1)[0]));
  return kept.length === parts.length
    ? url
    : url.slice(0, query) +
        (kept.length ? `?${kept.join("&")}` : "") +
        url.slice(end);
}

export function createFirefoxFilter(rules) {
  if (!Array.isArray(rules))
    throw new Error("Firefox filter rules must be an array.");
  // Host keys hold one rule, or an array when several rules share a host.
  const index = new Map(),
    generic = new Map(RESOURCE_TYPES.map((t) => [t, []])),
    seen = new Set();
  let allowAll = false;
  const put = (key, rule) => {
    const found = index.get(key);
    if (Array.isArray(found)) found.push(rule);
    else index.set(key, found ? [found, rule] : rule);
  };
  for (const raw of rules) {
    const rule = compile(raw, seen);
    if (rule.action === "modifyHeaders") continue;
    allowAll ||= rule.action === "allowAllRequests";
    const { requestDomains, urlFilter } = raw.condition;
    // "||host^", "||host/" and "||host:" can only match that host or its subdomains.
    const host = /^\|\|([^*^|/:\[\]]+)[\^/:]/.exec(urlFilter ?? "")?.[1];
    if (requestDomains) for (const domain of requestDomains) put(domain, rule);
    // Overlong or FQDN keys would miss bounded suffix lookups; the exact regex scan handles them.
    else if (host && !host.endsWith(".") && host.length <= MAX_DOMAIN)
      put(rule.caseSensitive ? host : host.toLowerCase(), rule);
    else for (const t of rule.types) generic.get(t).push(rule);
  }
  for (const list of generic.values()) list.sort(cmp);

  const best = (q) => {
    let top = null;
    const consider = (rule) => {
      if ((!top || cmp(rule, top) < 0) && matches(rule, q)) top = rule;
    };
    for (const domain of q.domains) {
      const found = index.get(domain);
      if (Array.isArray(found)) found.forEach(consider);
      else if (found) consider(found);
    }
    for (const rule of generic.get(q.type) ?? []) {
      if (top && cmp(rule, top) >= 0) break;
      if (matches(rule, q)) {
        top = rule;
        break;
      }
    }
    return top;
  };

  return {
    evaluate(details, topUrl) {
      const q = request(
        details?.url,
        TYPE_ALIASES.get(details?.type) ?? details?.type,
        details?.originUrl,
      );
      if (!q) return null;
      const rule = best(q);
      if (!rule || rule.rank <= RANK.allowAllRequests) return null;
      if (allowAll)
        for (const frame of ancestors(details, topUrl)) {
          const inherited = best(frame);
          if (
            inherited?.action === "allowAllRequests" &&
            cmp(inherited, rule) < 0
          )
            return null;
        }
      if (rule.action === "block") return { action: "block", ruleId: rule.id };
      const redirectUrl = stripParams(q.url, rule.removeParams);
      return redirectUrl === q.url
        ? null
        : { action: "redirect", ruleId: rule.id, redirectUrl };
    },
  };
}
