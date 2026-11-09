import {
  DEFAULTS,
  DEFAULT_ADBLOCK_URL,
  DEFAULT_ADBLOCK_MAX_BYTES,
  validateDefaultList,
  validateSettings,
  isActive,
  normalizeHost,
} from "./core/settings.js";
import { compileRules, selectorsFor } from "./core/rules.js";
import { applyPrivacy, readPrivacy } from "./core/privacy.js";
import { applyProxy, readProxy, routeProxy } from "./core/proxy.js";
import { testDns } from "./core/dns.js";

const api = globalThis.browser ?? globalThis.chrome;
const firefox =
  typeof globalThis.browser !== "undefined" && !!api.runtime.getBrowserInfo;
let current,
  compiled,
  lastError = null;
let serial = Promise.resolve();
const enqueue = (work) => {
  const task = serial.then(work);
  serial = task.catch(() => {});
  return task;
};
let bundled;
let defaultList = null;
async function sources(settings, prospectiveList = defaultList) {
  bundled ??= Promise.all(
    ["ads", "farms"].map(async (name) => {
      const response = await fetch(api.runtime.getURL(`lists/${name}.txt`));
      if (!response.ok)
        throw new Error(`Cannot read the bundled ${name} list.`);
      return { name, text: await response.text() };
    }),
  );
  const lists = await bundled;
  return [
    ...lists
      .filter((s) =>
        s.name === "ads" ? settings.adblock : settings.contentFarms,
      )
      .map((s) =>
        s.name === "ads" && prospectiveList
          ? { name: s.name, text: prospectiveList.text }
          : s,
      ),
    { name: "custom", text: settings.customRules },
    ...settings.subscriptions.map((s) => ({ name: s.url, text: s.text })),
  ];
}
async function compile(settings, prospectiveList = defaultList) {
  return compileRules(settings, await sources(settings, prospectiveList));
}
async function installRules(result) {
  for (const rule of result.rules.filter((r) => r.condition.regexFilter)) {
    const supported = await api.declarativeNetRequest.isRegexSupported({
      regex: rule.condition.regexFilter,
      isCaseSensitive: !!rule.condition.isUrlFilterCaseSensitive,
    });
    if (!supported.isSupported)
      throw new Error(
        `Browser does not support regex: ${rule.condition.regexFilter} (${supported.reason})`,
      );
  }
  const old = await api.declarativeNetRequest.getDynamicRules();
  await api.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: result.rules,
  });
}
async function apply(settings, result) {
  await installRules(result);
  const privacy = await applyPrivacy(api, settings.privacy, settings.enabled);
  if (
    settings.enabled &&
    settings.privacy.webrtc !== "native" &&
    !privacy.controls.webrtc.applied
  )
    throw new Error("The WebRTC policy could not be applied.");
  if (
    settings.enabled &&
    settings.privacy.fingerprinting === "resist" &&
    !privacy.controls.fingerprinting.applied
  )
    throw new Error("Native fingerprint protection could not be applied.");
  await registerProxyListener();
  const proxy = await applyProxy(api, {
    ...settings.proxy,
    enabled: settings.enabled && settings.proxy.enabled,
  });
  if (
    proxy.enabled &&
    !(
      proxy.applied ||
      (firefox &&
        proxy.handlerRequired &&
        api.proxy?.onRequest?.hasListener(firefoxProxyListener))
    )
  )
    throw new Error(proxy.message ?? "The proxy could not be applied.");
}
async function save(input, prospectiveList = defaultList) {
  const next = validateSettings(input);
  const result = await compile(next, prospectiveList);
  const previous = current;
  try {
    await apply(next, result);
    await api.storage.local.set({
      settings: next,
      ...(prospectiveList !== defaultList
        ? { defaultList: prospectiveList }
        : {}),
    });
  } catch (error) {
    try {
      if (previous) await apply(previous, await compile(previous));
    } catch (rollback) {
      throw new Error(
        `${error.message}; rollback failed: ${rollback.message}. Disable the extension and check its settings.`,
      );
    }
    throw error;
  }
  defaultList = prospectiveList;
  current = next;
  compiled = result;
  lastError = null;
  await notifyTabs();
  return state();
}
async function state() {
  const stored = await api.storage.local.get("stats");
  const proxyPermission = await api.permissions.contains({
    permissions: ["proxy"],
  });
  const proxyStatus = await readProxy(api, {
    ...current.proxy,
    enabled: current.enabled && current.proxy.enabled,
  }).catch((error) => ({ applied: false, error: error.message }));
  if (firefox && proxyStatus.handlerRequired)
    proxyStatus.applied =
      api.proxy?.onRequest?.hasListener(firefoxProxyListener) ?? false;
  return {
    ok: true,
    settings: current,
    defaultList: {
      url: DEFAULT_ADBLOCK_URL,
      updatedAt: defaultList?.updatedAt ?? null,
    },
    report: compiled.report,
    stats: {
      cleanedLinks: 0,
      cosmeticPages: 0,
      blockedRequests: null,
      ...stored.stats,
    },
    capabilities: {
      firefox,
      proxyPermission,
      rfp: !!api.privacy?.websites?.resistFingerprinting,
      dnrFeedback: !!api.declarativeNetRequest.onRuleMatchedDebug,
    },
    privacyStatus: await readPrivacy(
      api,
      current.privacy,
      current.enabled,
    ).catch((error) => ({ applied: false, error: error.message })),
    proxyStatus,
    error: lastError,
  };
}
async function notifyTabs() {
  for (const tab of await api.tabs.query({}).catch(() => [])) {
    if (tab.id && /^https?:/.test(tab.url ?? ""))
      api.tabs.sendMessage(tab.id, { type: "policyChanged" }).catch(() => {});
  }
}
async function policy(sender, previousCSS) {
  if (!sender.tab || !/^https?:/.test(sender.url ?? ""))
    throw new Error("This page is not supported.");
  const hostname = new URL(sender.url).hostname;
  let topHost = hostname;
  try {
    topHost = new URL(sender.tab.url).hostname;
  } catch {
    /* Restricted tab URL. */
  }
  const active = isActive(current, topHost) && isActive(current, hostname);
  const selectors = active ? selectorsFor(compiled.cosmetics, hostname) : [];
  const css = selectors
    .map((selector) => `${selector}{display:none!important}`)
    .join("\n");
  let cosmeticApplied = false;
  if (previousCSS !== undefined) {
    if (typeof previousCSS !== "string" || previousCSS.length > 6_000_000)
      throw new Error("Invalid previous CSS.");
    const target = { tabId: sender.tab.id, frameIds: [sender.frameId] };
    if (previousCSS)
      await api.scripting.removeCSS({
        target,
        css: previousCSS,
        origin: "USER",
      });
    if (css) {
      await api.scripting.insertCSS({ target, css, origin: "USER" });
      cosmeticApplied = true;
    }
  }
  return {
    ok: true,
    active,
    cleanUrls: active && current.cleanUrls,
    selectors,
    exceptions: [],
    css,
    cosmeticApplied,
  };
}
async function count(kind, amount = 1) {
  if (
    !current.statsEnabled ||
    !["cleanedLinks", "cosmeticPages", "blockedRequests"].includes(kind)
  )
    return;
  const { stats = {} } = await api.storage.local.get("stats");
  stats[kind] = Math.min(Number.MAX_SAFE_INTEGER, (stats[kind] ?? 0) + amount);
  await api.storage.local.set({ stats });
}
async function fetchSubscription(url, maxBytes = 2_000_000) {
  const response = await fetch(url, {
    credentials: "omit",
    cache: "no-cache",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || new URL(response.url).protocol !== "https:")
    throw new Error("Subscription download failed. Check the HTTPS URL.");
  if (/text\/html/.test(response.headers.get("content-type") ?? ""))
    throw new Error("The subscription returned HTML instead of a filter list.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Subscription exceeds ${maxBytes / 1_000_000} MB.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!text.trim() || /^\s*</.test(text))
    throw new Error("The subscription is empty or contains HTML.");
  return { url, text, updatedAt: new Date().toISOString() };
}
const ready = enqueue(async () => {
  current = structuredClone(DEFAULTS);
  compiled = compileRules(current, []);
  try {
    await api.storage.local.setAccessLevel?.({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    const stored = await api.storage.local.get(["settings", "defaultList"]);
    current = validateSettings(stored.settings ?? current);
    defaultList = stored.defaultList
      ? validateDefaultList(stored.defaultList)
      : null;
    compiled = await compile(current);
    await apply(current, compiled);
  } catch (error) {
    // Keep settings reachable after permission revocation or an invalid stored value.
    lastError = error.message;
  }
});

api.runtime.onMessage.addListener((message, sender, respond) => {
  const work = async () => {
    await ready;
    if (message?.type === "getPolicy")
      return policy(sender, message.previousCSS ?? "");
    if (message?.type === "recordStats") {
      const p = await policy(sender);
      if (
        p.active &&
        ["cleanedLinks", "cosmeticPages"].includes(message.kind) &&
        Number.isInteger(message.amount) &&
        message.amount > 0 &&
        message.amount <= 1000
      )
        await count(message.kind, message.amount);
      return { ok: true };
    }
    if (
      sender.id !== api.runtime.id ||
      !sender.url?.startsWith(api.runtime.getURL("ui/"))
    )
      throw new Error("Only extension settings pages can change settings.");
    switch (message.type) {
      case "getState":
        return state();
      case "saveSettings":
        return save(message.settings);
      case "previewRules":
        return {
          ok: true,
          report: (await compile(validateSettings(message.settings))).report,
        };
      case "testDns":
        return { ok: true, result: await testDns(message.region) };
      case "updateDefaultList": {
        const downloaded = validateDefaultList(
          await fetchSubscription(
            DEFAULT_ADBLOCK_URL,
            DEFAULT_ADBLOCK_MAX_BYTES,
          ),
        );
        const parsed = compileRules(
          { ...current, enabled: true, mode: "global" },
          [{ name: "BlahDNS Lite", text: downloaded.text }],
        ).report;
        if (parsed.accepted < 1000 || parsed.unsupported.length)
          throw new Error(
            "The default list is unexpectedly small or contains unsupported rules. Previous rules were kept.",
          );
        return save(current, downloaded);
      }
      case "updateSubscriptions": {
        const subscriptions = [];
        for (const entry of current.subscriptions)
          subscriptions.push(await fetchSubscription(entry.url));
        return save({ ...current, subscriptions });
      }
      case "setSite": {
        const domain = normalizeHost(message.domain);
        if (typeof message.paused !== "boolean")
          throw new Error("paused must be a boolean.");
        return save({
          ...current,
          exceptions: message.paused
            ? [...new Set([...current.exceptions, domain])]
            : current.exceptions.filter(
                (p) => p !== domain && p !== `*.${domain}`,
              ),
        });
      }
      case "resetStats":
        await api.storage.local.remove("stats");
        return state();
      default:
        throw new Error("Unsupported operation.");
    }
  };
  // Keep privileged mutations serialized; response handling works on Chrome and Firefox.
  enqueue(work).then(respond, (error) =>
    respond({ ok: false, error: error.message }),
  );
  return true;
});

const firefoxProxyListener = async (details) => {
  await ready;
  if (!current?.enabled || !current.proxy.enabled) return undefined;
  return routeProxy(current.proxy, details.url);
};
async function registerProxyListener() {
  if (!firefox || !api.proxy?.onRequest) return;
  const permitted = await api.permissions.contains({ permissions: ["proxy"] });
  if (permitted && !api.proxy.onRequest.hasListener(firefoxProxyListener)) {
    api.proxy.onRequest.addListener(firefoxProxyListener, {
      urls: ["<all_urls>"],
    });
  } else if (
    !permitted &&
    api.proxy.onRequest.hasListener(firefoxProxyListener)
  ) {
    api.proxy.onRequest.removeListener(firefoxProxyListener);
  }
}
void registerProxyListener().catch(() => {});
api.permissions.onAdded.addListener(() => {
  void registerProxyListener().catch(() => {});
});
api.permissions.onRemoved.addListener(() => {
  void registerProxyListener().catch(() => {});
});
api.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
  enqueue(async () => {
    await ready;
    const rule = compiled.rules.find((r) => r.id === info.rule.ruleId);
    if (rule?.action.type === "block" && !info.request.incognito)
      await count("blockedRequests");
  }).catch(() => {});
});
api.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install")
    ready.then(() => api.runtime.openOptionsPage()).catch(() => {});
});
