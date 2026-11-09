import { isActive, matchesPattern } from "../core/settings.js";
import { setTheme } from "./theme.js";

const api = globalThis.browser ?? globalThis.chrome;
const byId = (id) => document.getElementById(id);
const popupState = {
  settings: null,
  capabilities: {},
  hostname: "",
  tabId: null,
  paused: false,
  canResume: true,
};
let activityRequest = 0;

function setStatus(message, error = false) {
  const status = byId("popup-status");
  status.textContent = message;
  if (error) status.dataset.state = "error";
  else delete status.dataset.state;
}
function stateErrorMessage(state) {
  return [
    ...new Set(
      [state.error, state.privacyStatus?.error, state.proxyStatus?.error]
        .filter(Boolean)
        .map((error) =>
          typeof error === "string" ? error : (error?.message ?? String(error)),
        ),
    ),
  ].join(" ");
}

async function send(type, payload = {}) {
  if (!api?.runtime?.sendMessage)
    throw new Error("The extension background service is unavailable.");
  const response = await api.runtime.sendMessage({ type, ...payload });
  if (!response)
    throw new Error("The extension background service did not respond.");
  if (response.ok !== true)
    throw new Error(response.error || "The request failed.");
  return response;
}

function requestProxyPermissionBeforeSave(settings) {
  if (
    !settings.enabled ||
    !settings.proxy.enabled ||
    popupState.capabilities.proxyPermission
  )
    return Promise.resolve();
  if (typeof api?.permissions?.request !== "function") {
    return Promise.reject(
      new Error("This browser cannot request the proxy permission."),
    );
  }
  let request;
  try {
    request = api.permissions.request({ permissions: ["proxy"] });
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.resolve(request).then((granted) => {
    if (!granted)
      throw new Error(
        "Proxy permission was not granted. Settings were not saved.",
      );
    popupState.capabilities.proxyPermission = true;
  });
}

function updateSiteAction() {
  const button = byId("site-toggle");
  if (!popupState.hostname) {
    button.textContent = "Unavailable on this page";
    button.disabled = true;
    return;
  }
  if (popupState.paused && !popupState.canResume) {
    button.textContent = "Edit parent exception in settings";
    button.disabled = true;
    return;
  }
  button.disabled = false;
  button.textContent = popupState.paused
    ? "Resume filtering for this domain and subdomains"
    : "Pause filtering for this domain and subdomains";
}

function render(state) {
  popupState.settings = state.settings;
  setTheme(state.settings.theme ?? "system");
  popupState.capabilities = state.capabilities ?? {};
  const enabled = state.settings.enabled;
  const badge = byId("global-state");
  badge.textContent = enabled ? "Extension on" : "Extension off";
  badge.dataset.active = String(enabled);
  byId("global-toggle").disabled = false;
  byId("global-toggle").textContent = enabled
    ? "Pause extension everywhere"
    : "Resume extension everywhere";

  const matchingExceptions = popupState.hostname
    ? state.settings.exceptions.filter((pattern) =>
        matchesPattern(pattern, popupState.hostname),
      )
    : [];
  popupState.paused = matchingExceptions.length > 0;
  popupState.canResume = !matchingExceptions.some(
    (pattern) =>
      pattern.replace(/^\*\./, "").toLowerCase() !== popupState.hostname,
  );
  updateSiteAction();

  if (!popupState.hostname) {
    byId("current-host").textContent =
      "This page does not have a supported site host.";
    setStatus("Filtering controls are available on regular web pages.");
  } else {
    byId("current-host").textContent = popupState.hostname;
    const active = isActive(state.settings, popupState.hostname);
    if (popupState.paused && !popupState.canResume)
      setStatus(
        "A parent domain exception pauses this site. Edit the exception in full settings to resume it.",
      );
    else if (active)
      setStatus("Filtering is active on this domain and its subdomains.");
    else if (popupState.paused)
      setStatus("Filtering is paused on this domain and its subdomains.");
    else if (!enabled)
      setStatus(
        "The extension is off. Privacy controls and the proxy are also inactive.",
      );
    else if (state.settings.mode === "sites")
      setStatus("This domain is outside the selected site list.");
    else setStatus("Filtering is not active on this site.");
  }
  const stateError = stateErrorMessage(state);
  if (stateError) setStatus(stateError, true);
  byId("stats-enabled").checked = state.settings.statsEnabled;
  byId("stats-enabled").disabled = false;
  void refreshActivity();
}

async function refreshActivity() {
  const request = ++activityRequest;
  const list = byId("recent-rules");
  const note = byId("activity-note");
  try {
    list.replaceChildren();
    if (!popupState.settings?.statsEnabled) {
      byId("page-blocked").textContent = "Off";
      byId("page-cleaned").textContent = "Off";
      note.textContent =
        "Enable local statistics, then reload this page to collect requests.";
      return;
    }
    if (!popupState.hostname || !Number.isInteger(popupState.tabId))
      throw new Error("Statistics are available on regular web pages only.");
    const result = await send("getTabActivity", { tabId: popupState.tabId });
    if (request !== activityRequest) return;
    if (!result.enabled) {
      popupState.settings.statsEnabled = false;
      byId("stats-enabled").checked = false;
      return refreshActivity();
    }
    if (!result.available)
      throw new Error(
        result.reason ??
          "This browser build does not expose blocking feedback. Chrome and Brave require an unpacked development installation.",
      );
    const data = result.activity;
    byId("page-blocked").textContent = data.blockedRequests.toLocaleString();
    byId("page-cleaned").textContent = data.cleanedRequests.toLocaleString();
    for (const entry of data.recent) {
      const item = document.createElement("li");
      const filter = document.createElement("code");
      filter.textContent = entry.filter;
      item.append(
        `${entry.action === "block" ? "Blocked" : "Cleaned"} · Rule ${entry.ruleId} · ${entry.hits}× `,
        filter,
      );
      list.append(item);
    }
    if (!data.recent.length) {
      const item = document.createElement("li");
      item.textContent =
        "No BlahDNS network actions recorded on this page yet.";
      list.append(item);
    }
    note.textContent =
      "Only BlahDNS actions are counted. Recent rules clear on navigation, tab close, settings changes or browser restart. Reload after enabling.";
  } catch (error) {
    if (request !== activityRequest) return;
    byId("page-blocked").textContent = "Unavailable";
    byId("page-cleaned").textContent = "Unavailable";
    note.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function load() {
  try {
    const tabQuery = Promise.resolve()
      .then(() =>
        api?.tabs?.query
          ? api.tabs.query({ active: true, currentWindow: true })
          : [],
      )
      .catch(() => []);
    const [state, tabs] = await Promise.all([send("getState"), tabQuery]);
    const url = tabs[0]?.url;
    popupState.tabId = tabs[0]?.id ?? null;
    if (typeof url === "string" && /^https?:/i.test(url)) {
      try {
        popupState.hostname = new URL(url).hostname.toLowerCase();
      } catch {
        popupState.hostname = "";
      }
    }
    render(state);
  } catch (error) {
    byId("global-state").textContent = "Unavailable";
    byId("global-toggle").disabled = true;
    byId("site-toggle").disabled = true;
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

byId("global-toggle").addEventListener("click", async () => {
  if (!popupState.settings) return;
  const button = byId("global-toggle");
  button.disabled = true;
  try {
    const settings = JSON.parse(JSON.stringify(popupState.settings));
    settings.enabled = !settings.enabled;
    await requestProxyPermissionBeforeSave(settings);
    const state = await send("saveSettings", { settings });
    render(state);
    if (!stateErrorMessage(state)) {
      setStatus(
        state.settings.enabled
          ? "The extension is on. Filtering, configured privacy controls, and proxy settings can apply."
          : "The extension is off. Extension-controlled privacy and proxy settings are released.",
      );
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = !popupState.settings;
  }
});

byId("site-toggle").addEventListener("click", async () => {
  if (!popupState.hostname || !popupState.settings) return;
  const button = byId("site-toggle");
  button.disabled = true;
  try {
    const state = await send("setSite", {
      domain: popupState.hostname,
      paused: !popupState.paused,
    });
    render(state);
    if (!stateErrorMessage(state)) {
      setStatus(
        popupState.paused
          ? "Filtering is paused on this domain and its subdomains."
          : "Filtering is resumed on this domain and its subdomains.",
      );
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    updateSiteAction();
  }
});

byId("stats-enabled").addEventListener("change", async () => {
  const checkbox = byId("stats-enabled");
  checkbox.disabled = true;
  try {
    const state = await send("saveSettings", {
      settings: { ...popupState.settings, statsEnabled: checkbox.checked },
    });
    render(state);
  } catch (error) {
    checkbox.checked = !!popupState.settings?.statsEnabled;
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    checkbox.disabled = !popupState.settings;
  }
});
api.storage?.onChanged?.addListener((changes, area) => {
  if (
    area === "session" &&
    Object.hasOwn(changes, `tabActivity:${popupState.tabId}`)
  )
    void refreshActivity();
});

load();
