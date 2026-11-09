export const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "ttclid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "igshid",
  "srsltid",
];
export const SIGNED_KEYS = [
  "sig",
  "signature",
  "token",
  "access_token",
  "x-amz-signature",
  "x-goog-signature",
  "policy",
  "hmac",
];
export function cleanUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!["http:", "https:"].includes(url.protocol)) return value;
  // Preserve every byte of unrelated parameters, including signatures we do not recognize.
  const parts = url.search.slice(1).split("&");
  const keys = parts.map((part) => {
    try {
      return decodeURIComponent(
        part.split("=")[0].replace(/\+/g, " "),
      ).toLowerCase();
    } catch {
      return "";
    }
  });
  if (keys.some((key) => SIGNED_KEYS.includes(key))) return value;
  const kept = parts.filter(
    (_part, index) => !TRACKING_PARAMS.includes(keys[index]),
  );
  if (kept.length === parts.length) return value;
  const hashAt = value.indexOf("#");
  const fragment = hashAt < 0 ? "" : value.slice(hashAt);
  const queryAt = value.indexOf("?");
  return (
    value.slice(0, queryAt) +
    (kept.length && kept.join("&") ? `?${kept.join("&")}` : "") +
    fragment
  );
}
