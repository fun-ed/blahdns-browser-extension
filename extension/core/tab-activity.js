const keyFor = (tabId) => `tabActivity:${tabId}`;
const empty = () => ({ blockedRequests: 0, cleanedRequests: 0, recent: [] });

function filterText(rule, url) {
  const condition = rule.condition;
  if (condition.requestDomains) {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    const domain = condition.requestDomains.find(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
    return `||${domain}^`;
  }
  return condition.urlFilter ?? `/${condition.regexFilter}/`;
}

// The background queue serializes these updates. Session storage survives worker sleep, not browser restart.
export class TabActivity {
  constructor(storage) {
    this.storage = storage;
  }
  async get(tabId) {
    return (await this.storage.get(keyFor(tabId)))[keyFor(tabId)] ?? empty();
  }
  async record(tabId, rule, url) {
    if (!Number.isInteger(tabId) || tabId < 0) return;
    const action = rule.action.type;
    if (!["block", "redirect"].includes(action)) return;
    const activity = await this.get(tabId);
    const counter = action === "block" ? "blockedRequests" : "cleanedRequests";
    activity[counter] = Math.min(
      Number.MAX_SAFE_INTEGER,
      activity[counter] + 1,
    );
    const filter = filterText(rule, url).slice(0, 240);
    const previous = activity.recent.find(
      (entry) => entry.ruleId === rule.id && entry.filter === filter,
    );
    activity.recent = activity.recent.filter((entry) => entry !== previous);
    activity.recent.unshift({
      ruleId: rule.id,
      action,
      filter,
      hits: Math.min(Number.MAX_SAFE_INTEGER, (previous?.hits ?? 0) + 1),
    });
    activity.recent.length = Math.min(activity.recent.length, 10);
    await this.storage.set({ [keyFor(tabId)]: activity });
  }
  async clear(tabId) {
    if (Number.isInteger(tabId) && tabId >= 0)
      await this.storage.remove(keyFor(tabId));
  }
  async clearAll() {
    const keys = Object.keys(await this.storage.get(null)).filter((key) =>
      key.startsWith("tabActivity:"),
    );
    if (keys.length) await this.storage.remove(keys);
  }
}
