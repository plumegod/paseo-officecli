import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as tick } from "node:timers/promises";
import { test } from "node:test";
import ts from "typescript";
import { bridgeMessage, MAX_SELECTION_PATHS, selectionUpdate, watchRequest } from "../shared/watch.ts";

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...nodes(value.props?.children)];
}

test("watch UI tracks validated selection events and quotes the selection", async (t) => {
  const channel = "3c4214e4-213c-4e69-a4cf-4e8d13e89207";
  const leaseId = "a1457133-fc27-4f17-84b6-0376e2cb9123";
  const token = "22171133-fc27-4f17-84b6-0376e2cb9123";
  const state = { revision: 0, savedRevision: null, lastWrite: "none" };
  const previousWindow = globalThis.window;
  let listener;
  globalThis.window = {
    crypto: { randomUUID: () => channel },
    addEventListener: (_, fn) => { listener = fn; },
    removeEventListener: () => { listener = null; },
  };
  const slots = [], effects = [], cleanups = [], calls = [], published = [];
  let cursor = 0, nextEvents = [], prepareFailure = false;
  const rpc = {
    open: async () => ({ leaseId, html: "<html></html>", cursor: 0, ...state }),
    close: async () => ({}),
    request: async (input) => { calls.push({ type: "request", input }); return { body: "", ...state }; },
    events: async () => ({ events: nextEvents, cursor: 1, reload: false, ...state }),
    save: async () => state,
    prepare: async (input) => { calls.push({ type: "prepare", input }); if (prepareFailure) throw new Error("capture failed"); return { token, preview: "/body/p[1]\n选中的段落" }; },
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
      useLayoutEffect() { cursor++; },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { Text: "Text", View: "View" },
    "@getpaseo/plugin/client": { useRpc: (name) => rpc[name] },
    "@getpaseo/plugin/client/ui": { Loading: "Loading" },
    "../shared/officecli": { watchOpenRpc: "open", watchRequestRpc: "request", watchEventsRpc: "events", watchCloseRpc: "close", watchSaveRpc: "save", selectionPrepareRpc: "prepare" },
    "../shared/watch": { bridgeMessage, MAX_SELECTION_PATHS, selectionUpdate, watchRequest },
    "./web": { createPreviewUrl: () => "blob:preview", revokePreviewUrl() {}, PreviewFrame: "PreviewFrame" },
    "./watch-bridge": { watchBridge: () => "bridge" },
    "./controls": { ActionButton: "ActionButton" },
  };
  const source = readFileSync(new URL("../client/watch.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (name) => { assert.ok(name in mocks, `Unexpected import ${name}`); return mocks[name]; });
  const props = { workspaceId: "workspace", file: { path: "/workspace/test.docx", name: "test.docx" }, theme: { colors: { border: "#000", foreground: "#fff", foregroundMuted: "#aaa" } }, onChrome() {}, beginSelection(workspaceId, fileName) { published.length = 0; return (value) => { published.push({ workspaceId, fileName, token: value }); return true; }; } };
  const render = () => { cursor = 0; return nodes(exports.WatchEditor(props)); };
  const button = (tree, label) => tree.find((node) => node.type === "ActionButton" && node.props.label === label);
  let tree = render();
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  t.after(() => { cleanups.forEach((cleanup) => cleanup()); globalThis.window = previousWindow; });
  await tick();
  tree = render();
  const frameWindow = { postMessage() {} };
  tree.find((node) => node.type === "PreviewFrame").props.frameRef.current = { contentWindow: frameWindow };
  assert.equal(button(tree, "引用选中区域").props.disabled, true);

  const request = { channel, id: 1, kind: "request", route: "/api/selection", method: "POST", body: JSON.stringify({ paths: ["/body/p[1]"] }) };
  await listener({ source: {}, data: request });
  await listener({ source: frameWindow, data: { ...request, channel: token } });
  assert.equal(calls.length, 0, "untrusted frame messages are ignored");
  await listener({ source: frameWindow, data: request });
  assert.equal(button(render(), "引用选中区域").props.disabled, true, "wait for the visible selection event");
  nextEvents = [{ id: 1, type: "update", data: JSON.stringify({ action: "selection-update", paths: ["/body/p[1]"] }) }];
  await listener({ source: frameWindow, data: { channel, id: 2, kind: "events", after: 0 } });
  tree = render();
  assert.equal(button(tree, "引用选中区域").props.disabled, false);
  button(tree, "引用选中区域").props.onPress();
  await tick();
  tree = render();
  assert.deepEqual(calls.find((call) => call.type === "prepare").input, { workspaceId: "workspace", leaseId, paths: ["/body/p[1]"] });
  assert.ok(!JSON.stringify(tree).includes("选中的段落"), "the snapshot dump is not shown in the panel");
  assert.deepEqual(published, [{ workspaceId: "workspace", fileName: "test.docx", token }]);
  assert.ok(!JSON.stringify(tree).includes(token), "the internal token is not shown to the user");

  prepareFailure = true;
  button(tree, "引用选中区域").props.onPress();
  await tick();
  assert.equal(published.length, 0, "a failed capture removes the previous source");

  nextEvents = [{ id: 2, type: "update", data: JSON.stringify({ action: "selection-update", paths: Array(MAX_SELECTION_PATHS + 1).fill("/body/p[1]") }) }];
  await listener({ source: frameWindow, data: { channel, id: 3, kind: "events", after: 1 } });
  assert.equal(button(render(), "引用选中区域").props.disabled, true, "selection limit is visible before capture");
});
