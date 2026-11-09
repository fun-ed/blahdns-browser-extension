export const DEFAULT_ADBLOCK_URL =
  "https://oooo.b-cdn.net/blahdns/lite_adblocker.txt";
export const DEFAULT_ADBLOCK_MAX_BYTES = 4_000_000;

export const DEFAULTS = {
  version: 1,
  enabled: true,
  theme: "system",
  mode: "global",
  sites: [],
  exceptions: [],
  adblock: true,
  contentFarms: true,
  cleanUrls: true,
  customRules: "",
  subscriptions: [],
  statsEnabled: false,
  dnsRegion: "sg",
  dohManualStatus: "unknown",
  privacy: {
    webrtc: "native",
    fingerprinting: "native",
    language: "native",
    userAgent: "",
  },
  proxy: {
    enabled: false,
    type: "http",
    host: "127.0.0.1",
    port: 8080,
    mode: "global",
    sites: [],
    bypass: [],
  },
};

export function normalizeHost(value) {
  if (typeof value !== "string" || !value || /[\s/@?#:*\\]/.test(value))
    throw new Error("Enter a host name without a URL, port, or path.");
  const host = new URL(
    `https://${value.replace(/\.$/, "")}`,
  ).hostname.toLowerCase();
  if (
    host.length > 253 ||
    !host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new Error("Invalid host name.");
  return host;
}

export function normalizePattern(value) {
  if (typeof value !== "string")
    throw new Error("Site patterns must be strings.");
  const text = value.trim();
  return text.startsWith("*.")
    ? `*.${normalizeHost(text.slice(2))}`
    : normalizeHost(text);
}

export function matchesPattern(pattern, hostname) {
  const root = pattern.replace(/^\*\./, "").toLowerCase();
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === root || host.endsWith(`.${root}`);
}

export function isActive(settings, hostname) {
  return (
    settings.enabled &&
    !settings.exceptions.some((p) => matchesPattern(p, hostname)) &&
    (settings.mode === "global" ||
      settings.sites.some((p) => matchesPattern(p, hostname)))
  );
}

function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object.`);
}
function bool(value, name) {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}
function oneOf(value, choices, name) {
  if (!choices.includes(value))
    throw new Error(`${name} has an unsupported value.`);
  return value;
}
function text(value, max, name) {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${name} exceeds the size limit or has an invalid type.`);
  return value;
}
function patterns(value, name) {
  if (!Array.isArray(value) || value.length > 200)
    throw new Error(`${name} accepts at most 200 sites.`);
  return [...new Set(value.map(normalizePattern))];
}
export function validateSettings(input) {
  record(input, "settings");
  if (input.version !== 1) throw new Error("Unsupported settings version.");
  record(input.privacy, "privacy");
  record(input.proxy, "proxy");
  const p = input.privacy,
    proxy = input.proxy;
  const s = {
    version: 1,
    enabled: bool(input.enabled, "enabled"),
    theme: oneOf(
      input.theme === undefined ? "system" : input.theme,
      ["system", "light", "dark"],
      "theme",
    ),
    mode: oneOf(input.mode, ["global", "sites"], "mode"),
    sites: patterns(input.sites, "sites"),
    exceptions: patterns(input.exceptions, "exceptions"),
    adblock: bool(input.adblock, "adblock"),
    contentFarms: bool(input.contentFarms, "contentFarms"),
    cleanUrls: bool(input.cleanUrls, "cleanUrls"),
    customRules: text(input.customRules, 2_000_000, "customRules"),
    statsEnabled: bool(input.statsEnabled, "statsEnabled"),
    dnsRegion: oneOf(input.dnsRegion, ["sg", "de"], "dnsRegion"),
    dohManualStatus: oneOf(
      input.dohManualStatus === undefined ? "unknown" : input.dohManualStatus,
      ["unknown", "enabled", "disabled"],
      "dohManualStatus",
    ),
    privacy: {
      webrtc: oneOf(p.webrtc, ["native", "public", "proxy"], "webrtc"),
      fingerprinting: oneOf(
        p.fingerprinting,
        ["native", "resist"],
        "fingerprinting",
      ),
      language: oneOf(p.language, ["native", "en-US"], "language"),
      userAgent: text(p.userAgent, 512, "userAgent"),
    },
    proxy: {
      enabled: bool(proxy.enabled, "proxy.enabled"),
      type: oneOf(
        proxy.type,
        ["http", "https", "socks4", "socks5"],
        "proxy.type",
      ),
      host: normalizeHost(proxy.host),
      port: proxy.port,
      mode: oneOf(proxy.mode, ["global", "sites"], "proxy.mode"),
      sites: patterns(proxy.sites, "proxy.sites"),
      bypass: patterns(proxy.bypass, "proxy.bypass"),
    },
    subscriptions: [],
  };
  if (/[^\x20-\x7e]/.test(s.privacy.userAgent))
    throw new Error(
      "User-Agent must contain printable ASCII without line breaks.",
    );
  if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535)
    throw new Error("Proxy port must be between 1 and 65535.");
  if (!Array.isArray(input.subscriptions) || input.subscriptions.length > 8)
    throw new Error("At most 8 HTTPS subscriptions are allowed.");
  let total = s.customRules.length;
  const seen = new Set();
  for (const entry of input.subscriptions) {
    record(entry, "subscription");
    const url = new URL(text(entry.url, 2048, "subscription URL"));
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new Error(
        "Subscriptions require HTTPS URLs without credentials or fragments.",
      );
    if (seen.has(url.href)) throw new Error("Duplicate subscription URL.");
    seen.add(url.href);
    const body = text(entry.text, 2_000_000, "subscription text");
    total += body.length;
    s.subscriptions.push({
      url: url.href,
      text: body,
      updatedAt: text(entry.updatedAt, 64, "updatedAt"),
    });
  }
  if (total > 4_000_000)
    throw new Error(
      "Custom rules and subscriptions must not exceed 4 MB of text.",
    );
  return s;
}

export function validateDefaultList(input) {
  record(input, "default list cache");
  if (input.url !== DEFAULT_ADBLOCK_URL)
    throw new Error("Invalid default list source.");
  return {
    url: DEFAULT_ADBLOCK_URL,
    text: text(input.text, DEFAULT_ADBLOCK_MAX_BYTES, "default list text"),
    updatedAt: text(input.updatedAt, 64, "default list updatedAt"),
  };
}
