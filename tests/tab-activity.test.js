import { test, expect } from "bun:test";
import { TabActivity } from "../extension/core/tab-activity.js";

function fixture() {
  const data = { unrelated: true };
  const storage = {
    get: async (key) =>
      structuredClone(key === null ? data : { [key]: data[key] }),
    set: async (input) => Object.assign(data, structuredClone(input)),
    remove: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  return { data, storage, activity: new TabActivity(storage) };
}
const block = (id) => ({
  id,
  action: { type: "block" },
  condition: { urlFilter: `||tracker${id}.example^` },
});

test("tab activity bounds and groups recent rules, survives worker replacement, and clears its own keys", async () => {
  const f = fixture();
  for (let id = 1; id <= 12; id++)
    await f.activity.record(
      7,
      block(id),
      "https://tracker.example/private?secret=1",
    );
  await f.activity.record(
    7,
    block(12),
    "https://tracker.example/private?secret=2",
  );
  await f.activity.record(
    7,
    {
      id: 20,
      action: { type: "redirect" },
      condition: { regexFilter: "[?&]utm_source=" },
    },
    "https://example.test/?utm_source=secret",
  );
  const stored = await new TabActivity(f.storage).get(7);
  expect(stored.blockedRequests).toBe(13);
  expect(stored.cleanedRequests).toBe(1);
  expect(stored.recent).toHaveLength(10);
  expect(stored.recent[1].hits).toBe(2);
  expect(JSON.stringify(f.data)).not.toContain("secret");
  expect(JSON.stringify(f.data)).not.toContain("private");
  await f.activity.record(-1, block(1), "https://example.test/");
  expect(f.data["tabActivity:-1"]).toBeUndefined();
  await f.activity.clear(7);
  expect((await f.activity.get(7)).recent).toEqual([]);
  await f.activity.record(8, block(1), "https://example.test/");
  await f.activity.clearAll();
  expect(f.data).toEqual({ unrelated: true });
});
