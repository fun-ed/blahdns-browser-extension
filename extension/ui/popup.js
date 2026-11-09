import { isActive, matchesPattern } from "../core/settings.js";
import { setTheme } from "./theme.js";

const api = globalThis.browser ?? globalThis.chrome;
const byId = (id) => document.getElementById(id);
const popupState = {
  settings: null,
  capabilities: {},
  hostname: "",
  paused: false,
  canResume: true,
};

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

load();
