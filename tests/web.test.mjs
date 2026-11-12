import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../client/web.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function load(platform, environment) {
  const exports = {};
  const mocks = {
    react: { createElement: (type, props) => ({ type, props }) },
    "react-native": { Platform: { OS: platform } },
    "./preview-html.ts": { previewHtml: (html) => html },
  };
  new Function("exports", "require", "globalThis", outputText)(exports, (name) => { assert.ok(name in mocks, name); return mocks[name]; }, environment);
  return exports;
}

test("native import and cleanup never access browser storage or message APIs", () => {
  const environment = new Proxy({}, { get() { assert.fail("Native clients must not read browser APIs"); } });
  for (const platform of ["ios", "android"]) {
    const web = load(platform, environment);
    assert.equal(web.supportsPreview, false);
    assert.equal(web.clientStorage(), undefined);
    web.observeStorage(() => {})();
    web.observeFrameMessages(() => {})();
  }
});

test("web adapters preserve storage errors, subscribe and dispose, and isolate document frames", () => {
  const listeners = new Map();
  const storage = { getItem() { return null; }, setItem() {} };
  const environment = {
    localStorage: storage,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
  };
  const web = load("web", environment);
  assert.equal(web.clientStorage(), storage);
  const stopStorage = web.observeStorage(() => {}), stopFrame = web.observeFrameMessages(() => {});
  assert.deepEqual([...listeners.keys()], ["storage", "message"]);
  stopStorage(); stopFrame(); assert.equal(listeners.size, 0);
  Object.defineProperty(environment, "localStorage", { get() { throw new Error("denied"); } });
  assert.throws(web.clientStorage, /denied/);
  const frame = web.PreviewFrame({ url: "blob:sample", title: "Localized title" });
  assert.equal(frame.type, "iframe");
  assert.equal(frame.props.title, "Localized title");
  assert.equal(frame.props.sandbox, "allow-scripts");
  assert.equal(frame.props.referrerPolicy, "no-referrer");
});
