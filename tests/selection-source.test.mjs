import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { test } from "node:test";
import { searchPluginAttachments } from "@getpaseo/plugin/client/host";
import { createSelectionSource } from "../client/selection.ts";

const token = "22171133-fc27-4f17-84b6-0376e2cb9123";
const item = { id: "att", identifier: "PPTX", title: "report.pptx", url: "file:///report.pptx", text: "snap", resourceType: "officecli-selection" };

function registry(extra = {}) {
  const added = [], removed = [];
  const client = {
    addAttachmentSource(source) { added.push(source); return () => removed.push(source.id); },
    composers() { return []; },
    paseo: { agents: { async list() { return { entries: [] }; } } },
    async rpc() { return { items: [] }; },
    ...extra,
  };
  return { added, removed, client, store: createSelectionSource(client) };
}

test("prepared attachment source injects its private token and cleans up", async () => {
  const { added, removed, store } = registry();
  const stale = store.begin("workspace-a", "first.docx");
  const publish = store.begin("workspace-b", "report.pptx");
  assert.equal(stale(token), false, "an earlier capture cannot replace a newer one");
  assert.equal(publish(token), true);
  assert.equal(publish(token), false, "a capture can only be published once");
  const first = added[0];
  assert.match(first.title, /report\.pptx.*workspace-b/);
  assert.ok(!first.id.includes(token), "the capability is not exposed as a source id");
  const calls = [];
  await searchPluginAttachments(first, async (name, input) => { calls.push({ name, input }); return { items: [] }; }, "");
  assert.deepEqual(calls, [{ name: "officecli.selection.search", input: { query: "" } }]);

  const secondToken = "34171133-fc27-4f17-84b6-0376e2cb9123";
  store.begin("workspace-b", "report.pptx")(secondToken);
  assert.deepEqual(removed, [first.id]);
  assert.notEqual(added[1].id, first.id, "new snapshots must not reuse the host's cached search key");
  store.clear();
  assert.deepEqual(removed, [first.id, added[1].id]);
});

test("prepared selection attaches to this workspace's composer, not a focused one elsewhere", async () => {
  const attached = [];
  const other = { addAttachment() { attached.push("other"); }, async focus() {} };
  const mine = { addAttachment() { attached.push("mine"); }, async focus() {} };
  const { store } = registry({
    composers(selector) {
      if (selector?.focused) return [other];
      if (selector?.agentId === "agent-a") return [mine];
      return [];
    },
    paseo: { agents: { async list() { return { entries: [{ agent: { id: "agent-a", workspaceId: "wks" } }, { agent: { id: "agent-b", workspaceId: "other-wks" } }] }; } } },
    async rpc() { return { items: [item] }; },
  });
  assert.equal(store.begin("wks", "report.pptx")(token), true);
  await tick();
  await tick();
  assert.deepEqual(attached, ["mine"]);
});
