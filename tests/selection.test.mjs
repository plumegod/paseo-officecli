import assert from "node:assert/strict";
import { test } from "node:test";
import { PluginAttachmentItemSchema } from "@getpaseo/plugin";
import { resolve } from "node:path";
import { SelectionStore } from "../server/selection.ts";
import { MAX_SELECTION_PATHS, selectionUpdate } from "../shared/watch.ts";
import { selectionPrepareRpc, selectionSearchRpc } from "../shared/officecli.ts";

test("attachment snapshots require the exact random code and freeze content", () => {
  const store = new SelectionStore();
  const nodes = [{ path: "/body/p[@paraId=00100000]", text: "原文 中文" }];
  const captured = store.prepare(resolve("示例.docx"), nodes);
  nodes[0].text = "后来修改";
  assert.match(captured.preview, /原文 中文/);
  assert.equal(store.search("").items[0].text, captured.preview, "an empty picker query returns the latest snapshot");
  assert.deepEqual(store.search(captured.token.slice(0, -1)), { items: [] });
  const item = store.search(captured.token).items[0];
  assert.equal(captured.preview, item.text, "the UI preview is the complete attachment");
  PluginAttachmentItemSchema.parse(item);
  assert.notEqual(item.id, captured.token, "attachment metadata must not reveal the lookup code");
  assert.doesNotMatch(item.url, new RegExp(captured.token));
  assert.match(item.text, /原文 中文/);
  assert.doesNotMatch(item.text, /后来修改/);
  assert.match(item.text, /重新读取并核对/);
  assert.equal(item.identifier, "DOCX");
  assert.match(item.url, /^file:/);
});

test("selection storage is bounded and clearing removes staged snapshots", () => {
  const store = new SelectionStore();
  const document = resolve("example.pptx");
  const nodes = [{ path: "/slide[1]/shape[@id=1]", text: "text" }];
  const oldest = store.prepare(document, nodes);
  let latest;
  for (let i = 0; i < 20; i++) latest = store.prepare(document, nodes);
  assert.deepEqual(store.search(oldest.token), { items: [] });
  assert.equal(store.search(latest.token).items.length, 1);
  assert.throws(() => store.prepare(document, [{ path: "/slide[1]", text: "a".repeat(256 * 1024) }]), /256 KiB/);
  store.clear();
  assert.deepEqual(store.search(latest.token), { items: [] });
});

test("selection events follow official updates and RPCs reject invalid paths", () => {
  const update = (data, type = "update") => selectionUpdate({ id: 1, type, data: JSON.stringify(data) });
  assert.deepEqual(update({ action: "selection-update", paths: ["/body/p[1]"] }), ["/body/p[1]"]);
  assert.deepEqual(update({ action: "selection-update", paths: [] }), []);
  assert.deepEqual(update({ action: "selection-update", paths: ["../secret"] }), []);
  assert.equal(update({ action: "mark-update", paths: ["/body/p[1]"] }), null);
  assert.equal(selectionUpdate({ id: 1, type: "update", data: "not json" }), null);
  const input = { workspaceId: "workspace", leaseId: "0ced86a2-6515-4f2f-823c-f9def247c191", paths: ["/body/p[1]"] };
  selectionPrepareRpc.input.parse(input);
  assert.equal(selectionPrepareRpc.input.safeParse({ ...input, paths: [] }).success, false);
  assert.equal(selectionPrepareRpc.input.safeParse({ ...input, paths: Array(MAX_SELECTION_PATHS + 1).fill("/body/p[1]") }).success, false);
  assert.equal(selectionPrepareRpc.input.safeParse({ ...input, paths: ["/body/\0"] }).success, false);
  selectionSearchRpc.output.parse({ items: [] });
});
