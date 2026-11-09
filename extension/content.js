import { cleanUrl } from "./core/cleaner.js";
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  let policy = { active: false, cleanUrls: false, selectors: [] };
  let previousCSS = "";
  let cleaned = 0;
  let reportedCosmetic = false;
  let pending;
  const send = (message) => api.runtime.sendMessage(message);
  const stats = (kind, amount) =>
    send({ type: "recordStats", kind, amount }).catch(() => {});
  function cleanLink(link) {
    if (!policy.cleanUrls || !(link instanceof HTMLAnchorElement)) return;
    const before = link.getAttribute("href");
    if (!before) return;
    let absolute;
    try {
      absolute = new URL(before, document.baseURI).href;
    } catch {
      return;
    }
    const after = cleanUrl(absolute);
    if (after !== absolute) {
      link.href = after;
      cleaned++;
    }
  }
  function flush() {
    pending = undefined;
    if (!policy.active) return;
    // shortcut: scan 1000 links per batch; the click handler covers later links.
    let count = 0;
    for (const link of document.querySelectorAll("a[href]")) {
      cleanLink(link);
      if (++count === 1000) break;
    }
    if (cleaned) {
      stats("cleanedLinks", Math.min(cleaned, 1000));
      cleaned = 0;
    }
    if (
      !reportedCosmetic &&
      policy.cosmeticApplied &&
      policy.selectors.some((selector) => {
        try {
          return !!document.querySelector(selector);
        } catch {
          return false;
        }
      })
    ) {
      reportedCosmetic = true;
      stats("cosmeticPages", 1);
    }
  }
  async function refresh() {
    try {
      const next = await send({ type: "getPolicy", previousCSS });
      if (!next.ok) return;
      policy = next;
      previousCSS = next.css;
      flush();
    } catch {
      /* Extension can be unloaded while a page remains open. */
    }
  }
  const observer = new MutationObserver(() => {
    if (policy.active && !pending) pending = setTimeout(flush, 150);
  });
  observer.observe(document, { childList: true, subtree: true });
  document.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted)
        cleanLink(
          event
            .composedPath()
            .find((node) => node instanceof HTMLAnchorElement),
        );
    },
    true,
  );
  api.runtime.onMessage.addListener((message) => {
    if (message.type === "policyChanged") void refresh();
  });
  void refresh();
})();
