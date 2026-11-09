const WEBRTC_VALUES = {
  public: "default_public_interface_only",
  proxy: "disable_non_proxied_udp",
};

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

async function applySetting(
  api,
  setting,
  requested,
  activeValue,
  enabled,
  firefox,
) {
  if (!setting?.get || !setting?.set || !setting?.clear) {
    return {
      requested,
      supported: false,
      applied: false,
      message: "This browser does not provide this native privacy control.",
    };
  }

  const before = await callApi(api, setting, setting.get, [{}], firefox);
  const level = before?.levelOfControl;
  const shouldSet = enabled && activeValue !== undefined;
  if (shouldSet) {
    if (
      level &&
      ![
        "controlled_by_this_extension",
        "controllable_by_this_extension",
      ].includes(level)
    ) {
      return {
        requested,
        supported: true,
        applied: false,
        value: before?.value,
        levelOfControl: level,
        message:
          "This setting is controlled by the browser or another extension.",
      };
    }
    await callApi(api, setting, setting.set, [{ value: activeValue }], firefox);
  } else {
    await callApi(api, setting, setting.clear, [{}], firefox);
  }

  const after = await callApi(api, setting, setting.get, [{}], firefox);
  const afterLevel = after?.levelOfControl;
  const matches = shouldSet
    ? after?.value === activeValue &&
      (!afterLevel || afterLevel === "controlled_by_this_extension")
    : afterLevel !== "controlled_by_this_extension";
  return {
    requested,
    supported: true,
    applied: matches,
    value: after?.value,
    levelOfControl: after?.levelOfControl,
    message: matches
      ? shouldSet
        ? "Native setting applied."
        : "Extension setting released."
      : "Could not confirm the native setting.",
  };
}

export async function applyPrivacy(api, value, enabled) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("privacy settings must be an object.");
  if (typeof enabled !== "boolean")
    throw new Error("enabled must be a boolean.");
  if (!["native", "public", "proxy"].includes(value.webrtc))
    throw new Error("Unsupported webrtc setting.");
  if (!["native", "resist"].includes(value.fingerprinting))
    throw new Error("Unsupported fingerprinting setting.");
  if (!["native", "en-US"].includes(value.language))
    throw new Error("Unsupported language setting.");
  if (typeof value.userAgent !== "string")
    throw new Error("userAgent must be a string.");

  const firefox = await isFirefox(api);
  if (enabled && value.fingerprinting === "resist" && !firefox) {
    throw new Error("Chromium does not provide native resist fingerprinting.");
  }

  const controls = {};
  try {
    controls.webrtc = await applySetting(
      api,
      api?.privacy?.network?.webRTCIPHandlingPolicy,
      value.webrtc,
      WEBRTC_VALUES[value.webrtc],
      enabled,
      firefox,
    );
    controls.fingerprinting = await applySetting(
      api,
      api?.privacy?.websites?.resistFingerprinting,
      value.fingerprinting,
      value.fingerprinting === "resist" ? true : undefined,
      enabled,
      firefox,
    );
  } catch {
    throw new Error("Could not read or apply native browser privacy settings.");
  }

  const limitations = [
    "Language overrides affect only the HTTP Accept-Language header. This module does not change JavaScript language or other fingerprint signals.",
  ];
  if (value.userAgent)
    limitations.push(
      "A custom User-Agent applies only to the HTTP header. JavaScript, Client Hints, TLS, and workers remain unchanged.",
    );
  if (enabled && value.fingerprinting === "resist")
    limitations.push(
      "Firefox resist fingerprinting is global and may affect site compatibility.",
    );
  return {
    enabled,
    firefox,
    controls,
    language: {
      requested: value.language,
      supported: false,
      applied: value.language === "native" || !enabled,
      message:
        value.language === "en-US"
          ? "Accept-Language headers are managed by another module."
          : "The browser native language value is unchanged.",
    },
    userAgent: {
      requested: value.userAgent,
      supported: false,
      applied: !value.userAgent || !enabled,
      message: value.userAgent
        ? "The custom User-Agent header is managed by another module."
        : "No custom User-Agent is configured.",
    },
    limitations,
  };
}
