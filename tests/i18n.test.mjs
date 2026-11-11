import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { defineTranslations } from "@getpaseo/plugin/client";
import { PluginTranslationRuntime } from "@getpaseo/plugin/client/host";
import { normalizeLocale, translate, resources } from "../shared/locales.ts";
import { displayMessage, message, nested } from "../shared/messages.ts";
import { createLanguageStore, LANGUAGE_STORAGE_KEY, preference } from "../client/language-store.ts";

function storage(initial = null) {
  let value = initial;
  return { getItem(key) { assert.equal(key, LANGUAGE_STORAGE_KEY); return value; }, setItem(key, next) { assert.equal(key, LANGUAGE_STORAGE_KEY); value = next; } };
}

test("locale normalization respects scripts, regions, unknown languages and English fallback", () => {
  for (const [input, expected] of Object.entries({
    en: "en", "en-US": "en", en_GB: "en", ja: "ja", "ja-JP": "ja", "JA-jp": "ja",
    zh: "zh-CN", "zh-CN": "zh-CN", "zh-SG": "zh-CN", "zh-Hans": "zh-CN", "zh-Hans-HK": "zh-CN",
    "zh-TW": "zh-TW", "zh-Hant": "zh-TW", zh_HK: "zh-TW", "zh-MO": "zh-TW", "zh-Hant-CN": "zh-TW",
    fr: "en", "zh-unknown": "en", "": "en", system: "en",
  })) assert.equal(normalizeLocale(input), expected, input);
});

test("missing localized keys and unknown locales fall back to English; interpolation is literal", () => {
  const original = resources.ja.save;
  try { delete resources.ja.save; assert.equal(translate("ja", "save"), resources.en.save); }
  finally { resources.ja.save = original; }
  assert.equal(translate("fr-FR", "save"), "Save");
  assert.equal(translate("ja", "frameTitle", { name: '<&>{{save}} 日本語.docx' }), 'OfficeCLI プレビュー：<&>{{save}} 日本語.docx');
  assert.equal(translate("en", "does-not-exist"), "does-not-exist");
  assert.equal(translate("en", "toString"), "toString");
});

test("client preference persists, notifies every panel, restores and returns to follow", () => {
  const disk = storage("zh-TW");
  const store = createLanguageStore(() => disk);
  assert.equal(store.getSnapshot(), "zh-TW");
  let settings = 0, preview = 0;
  const unsubscribe = store.subscribe(() => settings++);
  store.subscribe(() => preview++);
  store.set("ja");
  assert.equal(store.getSnapshot(), "ja");
  assert.equal(createLanguageStore(() => disk).getSnapshot(), "ja");
  assert.deepEqual([settings, preview], [1, 1]);
  store.set("follow");
  assert.equal(createLanguageStore(() => disk).getSnapshot(), "follow");
  unsubscribe();
  disk.setItem(LANGUAGE_STORAGE_KEY, "en"); store.refresh();
  assert.deepEqual([settings, preview], [2, 3]);
  assert.equal(store.getSnapshot(), "en");
  assert.equal(createLanguageStore(() => storage()).getSnapshot(), "follow", "another client has its own preference");
  for (const input of [null, "system", "not-a-locale", {}, 42]) assert.equal(preference(input), "follow");
});

test("unavailable client storage reports failure without losing the in-memory choice", () => {
  for (const target of [undefined, { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } }]) {
    const store = createLanguageStore(() => target);
    store.set("zh-TW");
    assert.equal(store.getSnapshot(), "zh-TW");
    assert.equal(store.getError(), true);
  }
});

test("wire errors localize codes and nested plugin diagnostics, never raw official details", () => {
  const raw = '官方 stderr / raw CLI error {{name}} <script> & 日本語';
  const wire = message("cliFailed", { code: 7, detail: raw });
  assert.ok(!wire.includes("执行失败"));
  for (const locale of ["en", "zh-CN", "zh-TW", "ja"]) {
    const expected = translate(locale, "cliFailed", { code: 7, detail: raw });
    assert.equal(displayMessage(locale, new Error(wire)), expected);
    assert.equal(displayMessage(locale, "Error: " + wire), expected);
    assert.equal(displayMessage(locale, raw), raw);
    const nestedError = message("versionUnknown", { detail: nested(message("versionFailed", { detail: raw })) });
    assert.equal(displayMessage(locale, nestedError), translate(locale, "versionUnknown", { detail: translate(locale, "versionFailed", { detail: raw }) }));
  }
  const taggedDetail = message("save");
  assert.ok(displayMessage("ja", message("cliFailed", { code: 1, detail: taggedDetail })).includes(taggedDetail), "raw detail is not recursively interpreted");
  assert.equal(displayMessage("ja", "OFFICECLI_MESSAGE:broken"), "OFFICECLI_MESSAGE:broken");
});

test("SDK deferred host titles follow the presenting client and dispose their subscription", () => {
  let locale = "en", notify, disposed = false;
  const runtime = new PluginTranslationRuntime({ getLocale: () => locale, subscribe(listener) { notify = listener; return () => { disposed = true; }; } });
  const messages = defineTranslations({ resources });
  const title = messages.message("selectionTitle", { file: "原文.docx", workspace: "w" });
  let updates = 0;
  runtime.subscribe(() => updates++);
  for (const next of ["en", "zh-CN", "ja"]) {
    locale = next; notify();
    assert.equal(runtime.resolve(title), translate(next, "selectionTitle", { file: "原文.docx", workspace: "w" }));
  }
  assert.equal(updates, 3);
  runtime.dispose(); assert.equal(disposed, true);
});

test("the client adapter follows live host locale, overrides locally and observes storage events", () => {
  let hostLocale = "en-US", hostCalls = 0, listener, removed = false;
  const store = createLanguageStore(() => storage());
  const runtime = new PluginTranslationRuntime({ getLocale: () => hostLocale, subscribe: () => () => {} });
  const source = readFileSync(new URL("../client/i18n.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mocks = {
    react: { useSyncExternalStore: (_, get) => get() },
    "@getpaseo/plugin/client": { defineTranslations, useTranslation: (messages) => ({ locale: hostLocale, t: (key, ...args) => { hostCalls++; return runtime.t(messages, key, ...args); } }) },
    "../shared/locales.ts": { normalizeLocale, resources, translate },
    "../shared/messages.ts": { displayMessage },
    "./language-store.ts": { createLanguageStore: () => store, LANGUAGE_STORAGE_KEY },
  };
  const exports = {};
  const environment = { addEventListener(name, callback) { assert.equal(name, "storage"); listener = callback; }, removeEventListener(name, callback) { assert.equal(callback, listener); removed = true; } };
  new Function("exports", "require", "globalThis", outputText)(exports, (name) => { assert.ok(name in mocks, name); return mocks[name]; }, environment);
  const hook = exports.useOfficeTranslation;
  assert.equal(hook().t("save"), "Save");
  hostLocale = "ja"; assert.equal(hook().t("save"), "保存");
  assert.equal(hostCalls, 1, "exact host locales use the SDK translation function");
  hostLocale = "zh-HK"; assert.equal(hook().locale, "zh-TW");
  hook().setLanguage("zh-TW"); hostLocale = "en";
  assert.equal(hook().locale, "zh-TW"); assert.equal(hook().t("save"), "儲存");
  assert.equal(hostLocale, "en", "manual preference never writes Paseo locale");
  hook().setLanguage("follow"); assert.equal(hook().locale, "en");
  const stop = exports.observeLanguageStorage();
  let refreshed = 0; const refresh = store.refresh; store.refresh = () => { refreshed++; refresh(); };
  listener({ key: "unrelated" }); assert.equal(refreshed, 0);
  listener({ key: LANGUAGE_STORAGE_KEY }); listener({ key: null }); assert.equal(refreshed, 2);
  stop(); assert.equal(removed, true); runtime.dispose();
});
