import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createModeStore, documentType, documentTypes, MODE_STORAGE_KEYS } from "../client/mode-store.ts";

const defaults = { docx: "watch", pptx: "watch", xlsx: "preview" };
function storage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("only official supported file types have mode preferences and safe first-open defaults", () => {
  const disk = storage();
  const store = createModeStore(() => disk);
  assert.deepEqual(store.getSnapshot(), defaults);
  assert.equal(store.getError(), false);
  assert.equal(store.getSnapshot(), store.getSnapshot(), "external-store snapshots are stable between updates");
  for (const type of documentTypes) {
    assert.equal(documentType(`/work/folder.name/file.${type.toUpperCase()}`), type);
  }
  for (const path of ["/work/file.pdf", "/work/file.doc", "/folder.docx/file", "/work/file"]) assert.equal(documentType(path), null);
  assert.equal(disk.values.size, 0, "opening does not overwrite stored preferences");
});

test("each type remembers its last mode across panels, files and a new client session", () => {
  const disk = storage();
  disk.setItem("paseo-officecli.language.v1", "ja");
  const store = createModeStore(() => disk);
  let settings = 0, preview = 0;
  const stop = store.subscribe(() => settings++);
  store.subscribe(() => preview++);
  store.set("docx", "preview");
  assert.deepEqual(store.getSnapshot(), { ...defaults, docx: "preview" });
  assert.deepEqual(createModeStore(() => disk).getSnapshot(), store.getSnapshot());
  assert.equal(store.getSnapshot()[documentType("/other/another.docx")], "preview");
  store.set("xlsx", "watch");
  assert.deepEqual(createModeStore(() => disk).getSnapshot(), { docx: "preview", pptx: "watch", xlsx: "watch" });
  assert.deepEqual([settings, preview], [2, 2]);
  stop();
  store.set("pptx", "preview");
  assert.deepEqual([settings, preview], [2, 3]);
  assert.equal(disk.getItem("paseo-officecli.language.v1"), "ja");
  assert.deepEqual(createModeStore(() => storage()).getSnapshot(), defaults, "another client keeps its own defaults");
});

test("invalid or removed preferences fall back independently, never to command mode", () => {
  const disk = storage();
  for (const type of documentTypes) disk.setItem(MODE_STORAGE_KEYS[type], "commands");
  const store = createModeStore(() => disk);
  assert.deepEqual(store.getSnapshot(), defaults);
  store.set("xlsx", "invalid");
  assert.equal(store.getSnapshot().xlsx, "preview");
  disk.setItem(MODE_STORAGE_KEYS.pptx, "preview");
  store.refresh();
  assert.deepEqual(store.getSnapshot(), { ...defaults, pptx: "preview" });
  disk.values.clear();
  store.refresh();
  assert.deepEqual(store.getSnapshot(), defaults);
});

test("unavailable, denied and full storage keep modes usable and report persistence errors", () => {
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  for (const target of [undefined, denied, { getItem() { return null; }, setItem() { throw new Error("quota"); } }]) {
    const store = createModeStore(() => target);
    assert.deepEqual(store.getSnapshot(), defaults);
    store.set("docx", "preview");
    store.set("xlsx", "watch");
    assert.deepEqual(store.getSnapshot(), { ...defaults, docx: "preview", xlsx: "watch" });
    assert.equal(store.getError(), true);
    if (!target || target === denied) {
      store.refresh();
      assert.deepEqual(store.getSnapshot(), { ...defaults, docx: "preview", xlsx: "watch" });
    }
  }
});

test("the client hook shares one store and observes only mode storage changes, with cleanup", () => {
  const disk = storage();
  let listener, removed = false;
  const source = readFileSync(new URL("../client/modes.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mocks = {
    react: { useSyncExternalStore: (_, get) => get() },
    "./mode-store.ts": { createModeStore, MODE_STORAGE_KEYS },
  };
  const environment = {
    localStorage: disk,
    addEventListener(name, callback) { assert.equal(name, "storage"); listener = callback; },
    removeEventListener(name, callback) { assert.equal(name, "storage"); assert.equal(callback, listener); removed = true; },
  };
  const exports = {};
  new Function("exports", "require", "globalThis", outputText)(exports, (name) => { assert.ok(name in mocks, name); return mocks[name]; }, environment);
  const stop = exports.observeModeStorage();
  let refreshed = 0;
  const refresh = exports.modeStore.refresh;
  exports.modeStore.refresh = () => { refreshed++; refresh(); };
  disk.setItem(MODE_STORAGE_KEYS.docx, "preview");
  listener({ key: "paseo-officecli.language.v1" });
  assert.equal(refreshed, 0);
  assert.equal(exports.useDocumentModes().modes.docx, "watch");
  listener({ key: MODE_STORAGE_KEYS.docx });
  assert.equal(exports.useDocumentModes().modes.docx, "preview");
  exports.useDocumentModes().setMode("xlsx", "watch");
  assert.equal(exports.useDocumentModes().modes.xlsx, "watch");
  assert.equal(exports.useDocumentModes().storageError, false);
  disk.values.clear(); listener({ key: null });
  assert.deepEqual(exports.useDocumentModes().modes, defaults);
  assert.equal(refreshed, 2);
  stop(); assert.equal(removed, true);
});
