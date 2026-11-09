import { setTheme } from "./theme.js";

const api = globalThis.browser ?? globalThis.chrome;
const byId = (id) => document.getElementById(id);
const appState = {
  settings: null,
  capabilities: {},
  stats: {},
  privacyStatus: null,
  proxyStatus: null,
};
const numberFormat = new Intl.NumberFormat();
let ready = false;
let busy = false;
let pendingImport = null;

function announce(message) {
  byId("status").textContent = message;
}

function setSaveState(message, kind = "") {
  const element = byId("save-state");
  element.textContent = message;
  if (kind) element.dataset.state = kind;
  else delete element.dataset.state;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  setSaveState(message, "error");
  announce(message);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function subscriptionKey(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : value;
  } catch {
    return value;
  }
}

function subscriptionsFor(settings = appState.settings) {
  const cached = new Map(
    (settings?.subscriptions ?? []).map((entry) => [
      subscriptionKey(entry.url),
      entry,
    ]),
  );
  return lines(byId("subscription-urls").value).map((url) => {
    const previous = cached.get(subscriptionKey(url));
    return {
      url,
      text: previous?.text ?? "",
      updatedAt: previous?.updatedAt ?? "",
    };
  });
}

function renderSubscriptionCache(subscriptions) {
  const entries = subscriptions ?? [];
  const cached = entries.filter(
    (entry) => typeof entry.text === "string" && entry.text.length > 0,
  ).length;
  const latest = entries
    .map((entry) => entry.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const details = latest ? ` Latest update: ${latest}.` : "";
  byId("subscription-cache").textContent =
    `${entries.length} URL(s). ${cached} have cached rules.${details}`;
}

function renderControlStatus(control, label) {
  if (!control) return `${label}: status unavailable.`;
  if (!control.supported) return `${label}: native control is not supported.`;
  return `${label}: ${control.applied ? "applied" : "not applied"}.`;
}

function stateErrorMessages(state) {
  return [
    ...new Set(
      [state.error, state.privacyStatus?.error, state.proxyStatus?.error]
        .filter(Boolean)
        .map((error) =>
          typeof error === "string" ? error : (error?.message ?? String(error)),
        ),
    ),
  ];
}

function renderAppliedStatus(state) {
  const privacy = state.privacyStatus;
  const controls = privacy?.controls ?? {};
  const privacyText = [
    renderControlStatus(controls.webrtc, "WebRTC policy"),
    renderControlStatus(
      controls.fingerprinting,
      "Firefox resistFingerprinting",
    ),
  ];
  if (privacy?.error)
    privacyText.unshift(`Privacy status error: ${privacy.error}`);
  if (privacy?.enabled === false)
    privacyText.push(
      "Global filtering is off. Extension-controlled native settings are released.",
    );
  byId("privacy-status").textContent = privacyText.join(" ");

  const proxy = state.proxyStatus;
  let proxyText = "Proxy status unavailable.";
  if (proxy?.error) proxyText = `Proxy status error: ${proxy.error}`;
  else if (state.settings.proxy.enabled && !state.settings.enabled) {
    proxyText =
      "Proxy is configured, but global filtering is off. The proxy is not active.";
  } else if (proxy?.permissionRequired) {
    proxyText =
      "Proxy permission is required. Save while proxy is enabled to request it.";
  } else if (proxy?.supported === false) {
    proxyText = proxy.message ?? "The proxy settings API is unavailable.";
  } else if (proxy?.enabled && proxy.applied) {
    proxyText = "Proxy settings are applied.";
  } else if (proxy?.enabled) {
    proxyText =
      "Proxy settings are not applied. Another browser setting or extension may control the proxy.";
  } else if (proxy?.applied) {
    proxyText =
      "The extension released its proxy settings. Browser or system proxy settings may still apply.";
  }
  byId("proxy-status").textContent = proxyText;
}

function renderStats(stats, settings, capabilities) {
  const enabled = settings.statsEnabled;
  const values = [
    ["stat-cleaned", stats.cleanedLinks],
    ["stat-cosmetic", stats.cosmeticPages],
  ];
  for (const [id, value] of values) {
    byId(id).textContent =
      enabled && Number.isFinite(value)
        ? numberFormat.format(value)
        : enabled
          ? "—"
          : "Off";
  }
  if (!enabled) {
    byId("stat-blocked").textContent = "Off";
    byId("blocked-availability").textContent =
      "Turn on local statistics to collect counters.";
  } else if (stats.blockedRequests == null) {
    byId("stat-blocked").textContent = "Unavailable";
    byId("blocked-availability").textContent = capabilities.dnrFeedback
      ? "No blocked request total is available. The counter needs DNR debug events, which may be unavailable in production builds."
      : "Blocked request totals are unavailable in this build or browser. Production builds may not expose DNR debug events.";
  } else {
    byId("stat-blocked").textContent = Number.isFinite(stats.blockedRequests)
      ? numberFormat.format(stats.blockedRequests)
      : "Unavailable";
    byId("blocked-availability").textContent =
      "Blocked request totals use browser DNR debug feedback.";
  }
}

function renderReport(report) {
  const target = byId("rule-report");
  target.replaceChildren();
  if (!report) {
    target.hidden = true;
    return;
  }
  target.hidden = false;
  const heading = document.createElement("h3");
  heading.textContent = "Rule preview";
  const summary = document.createElement("p");
  summary.textContent = `Rules: ${report.rules ?? 0}. Domains: ${report.domains ?? 0}. Cosmetic rules: ${report.cosmetic ?? 0}. Accepted: ${report.accepted ?? 0}. Ignored: ${report.ignored ?? 0}. Unsupported: ${report.unsupported?.length ?? 0}.`;
  target.append(heading, summary);
  const unsupported = Array.isArray(report.unsupported)
    ? report.unsupported
    : [];
  if (!unsupported.length) return;
  const list = document.createElement("ol");
  list.className = "diagnostic-list";
  for (const item of unsupported.slice(0, 200)) {
    const row = document.createElement("li");
    const source = item.source ? `${item.source}: ` : "";
    const line = item.line == null ? "" : `Line ${item.line}: `;
    row.textContent = `${source}${line}${item.reason ?? "Unsupported rule"}`;
    list.append(row);
  }
  target.append(list);
  if (unsupported.length > 200) {
    const note = document.createElement("p");
    note.textContent = `Showing the first 200 of ${unsupported.length} unsupported rules.`;
    target.append(note);
  }
}

function updateButtonState() {
  const disabled = busy || !ready;
  for (const button of document.querySelectorAll("button"))
    button.disabled = disabled;
  for (const control of document.querySelectorAll("input, select, textarea"))
    control.disabled = disabled;
  byId("save-button").disabled = disabled;
  byId("apply-import").disabled = disabled || !pendingImport;
}

function fillSettings(state) {
  const settings = state.settings;
  appState.settings = clone(settings);
  appState.capabilities = state.capabilities ?? {};
  appState.stats = state.stats ?? {};
  appState.privacyStatus = state.privacyStatus ?? null;
  appState.proxyStatus = state.proxyStatus ?? null;

  for (const id of [
    "enabled",
    "adblock",
    "contentFarms",
    "cleanUrls",
    "statsEnabled",
  ]) {
    byId(id).checked = Boolean(settings[id]);
  }
  for (const id of ["mode", "customRules", "dnsRegion", "dohManualStatus"])
    byId(id).value = settings[id];
  byId("theme").value = settings.theme ?? "system";
  setTheme(byId("theme").value);
  byId("sites").value = settings.sites.join("\n");
  byId("exceptions").value = settings.exceptions.join("\n");
  byId("subscription-urls").value = settings.subscriptions
    .map((entry) => entry.url)
    .join("\n");
  byId("webrtc").value = settings.privacy.webrtc;
  byId("fingerprinting").value = settings.privacy.fingerprinting;
  byId("language").value = settings.privacy.language;
  byId("userAgent").value = settings.privacy.userAgent;
  byId("proxy-enabled").checked = settings.proxy.enabled;
  byId("proxy-type").value = settings.proxy.type;
  byId("proxy-host").value = settings.proxy.host;
  byId("proxy-port").value = settings.proxy.port;
  byId("proxy-mode").value = settings.proxy.mode;
  byId("proxy-sites").value = settings.proxy.sites.join("\n");
  byId("proxy-bypass").value = settings.proxy.bypass.join("\n");

  const rfpOption = byId("fingerprinting").querySelector(
    'option[value="resist"]',
  );
  rfpOption.disabled = !appState.capabilities.rfp;
  if (!appState.capabilities.rfp) {
    byId("rfp-capability").textContent =
      "This browser does not provide native resistFingerprinting. Chrome and Brave extensions cannot provide the same protection.";
  } else {
    byId("rfp-capability").textContent =
      "This is a global Firefox setting. It may affect site compatibility.";
  }

  renderSubscriptionCache(settings.subscriptions);
  const updatedAt = state.defaultList?.updatedAt;
  const timestamp =
    typeof updatedAt === "string" ? Date.parse(updatedAt) : Number.NaN;
  byId("default-list-status").textContent = Number.isFinite(timestamp)
    ? `Downloaded copy cached. Last updated ${new Date(timestamp).toLocaleString()}.`
    : "Using the bundled snapshot.";
  renderStats(appState.stats, settings, appState.capabilities);
  renderAppliedStatus(state);
  renderReport(state.report);
}

function collectSettings() {
  const current = appState.settings;
  return {
    ...current,
    enabled: byId("enabled").checked,
    theme: byId("theme").value,
    mode: byId("mode").value,
    sites: lines(byId("sites").value),
    exceptions: lines(byId("exceptions").value),
    adblock: byId("adblock").checked,
    contentFarms: byId("contentFarms").checked,
    cleanUrls: byId("cleanUrls").checked,
    customRules: byId("customRules").value,
    subscriptions: subscriptionsFor(current),
    statsEnabled: byId("statsEnabled").checked,
    dnsRegion: byId("dnsRegion").value,
    dohManualStatus: byId("dohManualStatus").value,
    privacy: {
      ...current.privacy,
      webrtc: byId("webrtc").value,
      fingerprinting: byId("fingerprinting").value,
      language: byId("language").value,
      userAgent: byId("userAgent").value,
    },
    proxy: {
      ...current.proxy,
      enabled: byId("proxy-enabled").checked,
      type: byId("proxy-type").value,
      host: byId("proxy-host").value.trim(),
      port: Number(byId("proxy-port").value),
      mode: byId("proxy-mode").value,
      sites: lines(byId("proxy-sites").value),
      bypass: lines(byId("proxy-bypass").value),
    },
  };
}

function refreshSubscriptionCache() {
  if (appState.settings)
    renderSubscriptionCache(subscriptionsFor(appState.settings));
}

function markDirty() {
  if (!ready) return;
  setSaveState("Unsaved changes");
  refreshSubscriptionCache();
}

function applyState(state, successMessage = "") {
  fillSettings(state);
  ready = true;
  updateButtonState();
  const errors = stateErrorMessages(state);
  if (errors.length)
    showError([successMessage, ...errors].filter(Boolean).join(" "));
  else if (successMessage) {
    setSaveState(successMessage, "success");
    announce(successMessage);
  }
}

function requestProxyPermissionBeforeSave(settings) {
  if (!settings?.proxy?.enabled || appState.capabilities.proxyPermission)
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
    appState.capabilities.proxyPermission = true;
  });
}

async function saveCandidate(settings) {
  await requestProxyPermissionBeforeSave(settings);
  const state = await send("saveSettings", { settings });
  applyState(state, "Settings saved.");
  return state;
}

async function runAction(action) {
  if (busy) return;
  busy = true;
  updateButtonState();
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    updateButtonState();
  }
}

function selectTab() {
  const allowed = new Set(["filtering", "privacy", "network", "data"]);
  const requested = location.hash.slice(1);
  const selected = allowed.has(requested) ? requested : "filtering";
  if (requested !== selected) history.replaceState(null, "", `#${selected}`);
  for (const name of allowed) {
    const active = name === selected;
    byId(`panel-${name}`).hidden = !active;
    const tab = byId(`tab-${name}`);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

function appendDiagnostics(result) {
  const answers = Array.isArray(result.answers) ? result.answers : [];
  const target = byId("dns-result");
  target.replaceChildren();
  target.hidden = false;
  const message = document.createElement("p");
  const rcodeName =
    ["NOERROR", "FORMERR", "SERVFAIL", "NXDOMAIN", "NOTIMP", "REFUSED"][
      result.rcode
    ] ?? `RCODE ${result.rcode}`;
  message.textContent =
    result.rcode === 0
      ? `DNS-over-HTTPS check succeeded (${rcodeName}).`
      : `DNS-over-HTTPS endpoint returned ${rcodeName}.`;
  const details = document.createElement("p");
  details.textContent = `Endpoint: ${result.endpoint}. RCODE: ${result.rcode}. Latency: ${result.latencyMs} ms. Answers: ${answers.length ? answers.join(", ") : "none"}.`;
  target.append(message, details);
}

async function loadState() {
  try {
    const state = await send("getState");
    applyState(state, "Settings loaded.");
  } catch (error) {
    showError(error);
    byId("save-button").disabled = true;
  }
}

for (const control of document.querySelectorAll("input, select, textarea")) {
  control.addEventListener("input", markDirty);
  control.addEventListener("change", markDirty);
}
byId("theme").addEventListener("change", (event) =>
  setTheme(event.currentTarget.value),
);
byId("subscription-urls").addEventListener("input", refreshSubscriptionCache);
window.addEventListener("hashchange", selectTab);
selectTab();

byId("save-button").addEventListener("click", () =>
  runAction(async () => {
    const candidate = collectSettings();
    await saveCandidate(candidate);
  }),
);

byId("preview-button").addEventListener("click", () =>
  runAction(async () => {
    const candidate = collectSettings();
    const response = await send("previewRules", { settings: candidate });
    renderReport(response.report);
    setSaveState("Rule preview complete. Settings were not saved.", "success");
    announce("Rule preview complete.");
  }),
);

byId("rule-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const current = byId("customRules").value;
    byId("customRules").value =
      `${current}${current && !current.endsWith("\n") ? "\n" : ""}${text}`;
    markDirty();
    setSaveState(`Appended ${file.name}. Save to apply the rules.`);
    announce(`Appended ${file.name}.`);
  } catch (error) {
    showError(error);
  } finally {
    event.target.value = "";
  }
});

byId("update-subscriptions").addEventListener("click", () =>
  runAction(async () => {
    await saveCandidate(collectSettings());
    const state = await send("updateSubscriptions");
    applyState(state, "Subscriptions updated.");
  }),
);
byId("update-default-list").addEventListener("click", () =>
  runAction(async () => {
    await saveCandidate(collectSettings());
    const state = await send("updateDefaultList");
    applyState(state, "BlahDNS Lite updated.");
  }),
);

byId("test-dns").addEventListener("click", () =>
  runAction(async () => {
    const response = await send("testDns", { region: byId("dnsRegion").value });
    appendDiagnostics(response.result);
    setSaveState("DNS test complete.", "success");
    announce("DNS test complete.");
  }),
);

byId("reset-stats").addEventListener("click", () =>
  runAction(async () => {
    const state = await send("resetStats");
    applyState(state, "Statistics reset.");
  }),
);

byId("export-settings").addEventListener("click", () =>
  runAction(async () => {
    const state = await send("getState");
    const blob = new Blob([JSON.stringify(state.settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "blahdns-settings.json";
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSaveState("Exported the current saved settings.", "success");
    announce("Settings exported.");
  }),
);

byId("import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  pendingImport = null;
  updateButtonState();
  try {
    if (file.size > 50_000_000)
      throw new Error("Settings file is too large. The limit is 50 MB.");
    pendingImport = JSON.parse(await file.text());
    byId("import-name").textContent =
      `${file.name} is ready. Choose Validate and apply import to continue.`;
    setSaveState("Import ready for validation.");
    announce("Import file ready.");
  } catch (error) {
    byId("import-name").textContent = "The selected file is not valid JSON.";
    showError(error);
  }
  updateButtonState();
});

byId("apply-import").addEventListener("click", () =>
  runAction(async () => {
    if (!pendingImport) throw new Error("Choose a settings file first.");
    await saveCandidate(pendingImport);
    pendingImport = null;
    byId("import-file").value = "";
    byId("import-name").textContent = "Settings imported and validated.";
    updateButtonState();
  }),
);

updateButtonState();
loadState();
