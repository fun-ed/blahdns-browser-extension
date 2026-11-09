import { matchesPattern, normalizeHost, normalizePattern } from "./settings.js";

const TYPES = new Set(["http", "https", "socks4", "socks5"]);

export function validateProxy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Proxy settings must be an object.");
  if (typeof value.enabled !== "boolean")
    throw new Error("proxy.enabled must be a boolean.");
  if (!TYPES.has(value.type)) throw new Error("Unsupported proxy type.");
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535)
    throw new Error("Proxy port must be between 1 and 65535.");
  if (!["global", "sites"].includes(value.mode))
    throw new Error("Unsupported proxy scope.");
  const patterns = (items, name) => {
    if (!Array.isArray(items) || items.length > 200)
      throw new Error(`${name} must contain at most 200 entries.`);
    return [
      ...new Set(
        items.map((pattern) => {
          try {
            return normalizePattern(pattern);
          } catch {
            throw new Error(`${name} contains an invalid domain pattern.`);
          }
        }),
      ),
    ];
  };
  let host;
  try {
    host = normalizeHost(value.host);
  } catch {
    throw new Error("proxy.host must be a hostname without a URL or port.");
  }
  return {
    enabled: value.enabled,
    type: value.type,
    host,
    port: value.port,
    mode: value.mode,
    sites: patterns(value.sites, "proxy.sites"),
    bypass: patterns(value.bypass, "proxy.bypass"),
  };
}

function patternMatchSource() {
  return `function matchesAny(host, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var root = patterns[i].replace(/^\\*\\./, '');
      if (host === root || host.slice(-(root.length + 1)) === '.' + root) return true;
    }
    return false;
  }`;
}

function proxyDirective(proxy) {
  const protocol = {
    http: "PROXY",
    https: "HTTPS",
    socks4: "SOCKS4",
    socks5: "SOCKS5",
  }[proxy.type];
  return `${protocol} ${proxy.host}:${proxy.port}`;
}

export function createPac(value) {
  const proxy = validateProxy(value);
  const selectedSites = !proxy.enabled
    ? "false"
    : proxy.mode === "global"
      ? "true"
      : "matchesAny(host, sites)";
  return `function FindProxyForURL(url, host) {
  ${patternMatchSource()}
  host = host.toLowerCase().replace(/\\.$/, '');
  var sites = ${JSON.stringify(proxy.sites)};
  var bypass = ${JSON.stringify(proxy.bypass)};
  if (!(${selectedSites}) || matchesAny(host, bypass)) return "DIRECT";
  return ${JSON.stringify(proxyDirective(proxy))};
}`;
}

function destinationHostname(value) {
  try {
    const url = new URL(value);
    return url.hostname
      ? url.hostname.toLowerCase().replace(/\.$/, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function isSelected(proxy, hostname) {
  if (
    !proxy.enabled ||
    !hostname ||
    proxy.bypass.some((pattern) => matchesPattern(pattern, hostname))
  )
    return false;
  return (
    proxy.mode === "global" ||
    proxy.sites.some((pattern) => matchesPattern(pattern, hostname))
  );
}

export function routeProxy(value, url) {
  const proxy = validateProxy(value);
  const hostname = destinationHostname(url);
  if (!isSelected(proxy, hostname)) return undefined;
  const type = proxy.type === "socks5" ? "socks" : proxy.type;
  return [
    {
      type,
      host: proxy.host,
      port: proxy.port,
      ...(proxy.type === "socks5" ? { proxyDNS: true } : {}),
    },
    null,
  ];
}

function callApi(api, target, method, args = [], firefox = false) {
  if (firefox) return Promise.resolve(method.call(target, ...args));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      const error = api?.runtime?.lastError;
      if (error) reject(new Error(error.message || "Browser API failed."));
      else resolve(value);
    };
    let result;
    try {
      result = method.call(target, ...args, done);
    } catch (error) {
      reject(error);
      return;
    }
    if (result && typeof result.then === "function") result.then(done, reject);
    else if (result !== undefined) done(result);
  });
}

function status(proxy, values = {}) {
  return {
    enabled: proxy.enabled,
    applied: false,
    supported: true,
    permissionRequired: false,
    ...values,
  };
}

async function isFirefox(api) {
  if (api?.proxy?.onRequest) return true;
  if (typeof api?.runtime?.getBrowserInfo !== "function") return false;
  try {
    const info = await api.runtime.getBrowserInfo();
    return /firefox/i.test(info?.name || "");
  } catch {
    return false;
  }
}

async function manageProxy(api, value, write) {
  const proxy = validateProxy(value);
  const firefox = await isFirefox(api);

  if (proxy.enabled) {
    if (!api.permissions?.contains) {
      return status(proxy, {
        permissionRequired: true,
        message: "Grant the optional proxy permission first.",
      });
    }
    try {
      const granted = await callApi(
        api,
        api.permissions,
        api.permissions.contains,
        [{ permissions: ["proxy"] }],
        firefox,
      );
      if (!granted)
        return status(proxy, {
          permissionRequired: true,
          message: "Grant the optional proxy permission first.",
        });
    } catch {
      return status(proxy, {
        permissionRequired: true,
        message: "Could not verify proxy permission. Grant it again.",
      });
    }
  }

  if (firefox) {
    return status(proxy, {
      applied: !proxy.enabled,
      handlerRequired: proxy.enabled,
      method: "firefox-onRequest",
      message: proxy.enabled
        ? "Firefox proxy routing is handled by the background listener."
        : "Firefox proxy routing is disabled.",
    });
  }

  const settings = api?.proxy?.settings;
  if (!settings?.get || (write && (!settings.set || !settings.clear))) {
    return status(proxy, {
      supported: false,
      message: "This browser does not support the proxy settings API.",
    });
  }

  try {
    const before = await callApi(api, settings, settings.get, [{}]);
    const level = before?.levelOfControl;
    if (proxy.enabled) {
      if (
        level &&
        ![
          "controlled_by_this_extension",
          "controllable_by_this_extension",
        ].includes(level)
      ) {
        return status(proxy, {
          applied: false,
          levelOfControl: level,
          message: "The browser or another extension controls proxy settings.",
        });
      }
      if (write)
        await callApi(api, settings, settings.set, [
          {
            value: {
              mode: "pac_script",
              pacScript: { data: createPac(proxy), mandatory: true },
            },
            scope: "regular",
          },
        ]);
      const after = write
        ? await callApi(api, settings, settings.get, [{}])
        : before;
      const applied =
        after?.levelOfControl === "controlled_by_this_extension" &&
        after?.value?.mode === "pac_script" &&
        after?.value?.pacScript?.mandatory === true &&
        (write || after?.value?.pacScript?.data === createPac(proxy));
      return status(proxy, {
        applied,
        method: "mandatory-pac",
        levelOfControl: after?.levelOfControl,
        message: applied
          ? "Mandatory PAC applied. Selected destinations do not fall back to direct."
          : "Could not verify that mandatory PAC is active.",
      });
    }

    const applied = write || level !== "controlled_by_this_extension";
    // clear removes our contribution even when another extension takes precedence.
    if (write)
      await callApi(api, settings, settings.clear, [{ scope: "regular" }]);
    return status(proxy, {
      applied,
      levelOfControl: level,
      message: applied
        ? "Extension proxy setting released. Browser or system proxy settings may still apply."
        : "Could not confirm that the extension proxy setting is released.",
    });
  } catch {
    return status(proxy, {
      applied: false,
      message: write
        ? "Could not apply proxy settings. Check browser permission."
        : "Could not read proxy settings. Check browser permission.",
    });
  }
}

export function applyProxy(api, value) {
  return manageProxy(api, value, true);
}

export function readProxy(api, value) {
  return manageProxy(api, value, false);
}
