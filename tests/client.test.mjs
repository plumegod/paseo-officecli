import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { MAX_INPUT_CHARS, parseArguments } from "../shared/commands.ts";
import { messages, translations } from "./i18n-fixture.mjs";
import { languageNames, locales } from "../shared/locales.ts";
import { createModeStore, documentType, documentTypes } from "../client/mode-store.ts";

function load(path, mocks) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (name) => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  });
  return exports;
}

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...nodes(value.props?.children)];
}

const theme = { colors: { surface0: "#111", surface1: "#222", border: "#333", foreground: "#fff", foregroundMuted: "#aaa", accent: "#eee" } };
const props = { workspaceId: "workspace", theme, layout: { compact: false }, path: "/work/test.docx" };

function installation(overrides = {}) {
  return {
    executable: "/bin/officecli", version: "1.0.160", compatibility: "supported", diagnostic: "安装可用；以当前 help 为准。",
    capabilities: Object.fromEntries(["htmlPreview", "get", "batch", "save", "mcp"].map((key) => [key, { status: "supported", diagnostic: `help supports ${key}` }])),
    ...overrides,
  };
}

function surface(path) {
  const values = [];
  let cursor = 0;
  const calls = [];
  const Modal = Object.assign(() => {}, { Content: "ModalContent" });
  const h = {
    calls,
    Modal,
    locale: "zh-CN",
    query: { data: { directory: "/work", executable: "/bin/officecli", installation: installation(), job: null }, isPending: false, isError: false, refetch() {} },
    statusQuery: { data: installation(), isPending: false, isError: false, async refetch() { return { data: this.data }; } },
    queries: new Map(), mutations: [],
    settings: { status: "ready", values: { executable: "" }, revision: 1, saving: false },
    modeStore: createModeStore(() => ({ getItem: () => null, setItem() {} })),
  };
  const jsx = (type, props) => ({ type, props });
  const component = load(path, {
    react: { useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === "function" ? initial() : initial; return [values[i], (value) => { values[i] = value; }]; }, useEffect() {} },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Text: "Text", View: "View" },
    "@getpaseo/plugin/client": { useRpc: (operation) => (input) => calls.push({ operation, input }), useSettings: () => h.settings },
    "@getpaseo/plugin/client/ui": { Modal, Loading: "Loading", ScrollView: "ScrollView", TextInput: "TextInput", SettingsSwitch: "SettingsSwitch", SettingsCard: "SettingsCard", SettingsSection: "SettingsSection", SettingsInput: "SettingsInput", SettingsAction: "SettingsAction", SettingsRow: "SettingsRow", SettingsSelect: "SettingsSelect", ExternalLink: "ExternalLink", copyText: async () => {} },
    "@tanstack/react-query": {
      useQuery: (options) => { h.queries.set(options.queryKey[0], options); return path === "client/preview.tsx" && options.queryKey[0] === "officecli.status" ? h.statusQuery : h.query; },
      useMutation: (options) => { h.mutations.push(options); return { mutate: (...args) => options.mutationFn(...args), isPending: false, reset() {} }; },
      useQueryClient: () => ({ setQueryData: (key, value) => { (key[0] === "officecli.status" ? h.statusQuery : h.query).data = value; }, invalidateQueries() {} }),
    },
    "../shared/officecli": { officeSettings: {}, statusRpc: "status", previewRpc: "preview", commandStateRpc: "state", commandStartRpc: "start", commandInputRpc: "input", commandStopRpc: "stop" },
    "../shared/commands": { MAX_INPUT_CHARS, parseArguments },
    "./controls": { ActionButton: "ActionButton", Disclosure: "Disclosure" },
    "./i18n": { useOfficeTranslation: () => translations(h.locale) },
    "./language-store": { languageNames },
    "./mode-store": { documentType, documentTypes },
    "./modes": { useDocumentModes: () => ({ modes: h.modeStore.getSnapshot(), storageError: h.modeStore.getError(), setMode: h.modeStore.set }) },
    "../shared/locales": { locales },
    "./commands": { CommandConsole: "CommandConsole" },
    "./watch": { WatchEditor: "WatchEditor" },
    "./web": { supportsPreview: true, createPreviewUrl() {}, revokePreviewUrl() {}, PreviewFrame: "PreviewFrame" },
  });
  h.render = (overrides = {}) => { cursor = 0; h.mutations = []; return nodes(Object.values(component)[0]({ ...props, ...overrides })); };
  return h;
}

const button = (tree, label) => tree.find((node) => node.type === "ActionButton" && node.props.label === label);

test("navigation registers the file panel and settings, and cleans up prepared selections", () => {
  const disposed = [];
  const selections = { begin() {}, clear: () => disposed.push("selection") };
  const { default: contribute } = load("index.client.tsx", {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "./client/preview": { OfficePreview: "Preview" },
    "./client/selection": { createSelectionSource: () => selections },
    "./client/settings": { OfficeSettings: "Settings" },
    "./client/i18n": { messages, observeLanguageStorage: () => () => {} },
    "./client/modes": { observeModeStorage: () => () => disposed.push("modeStorage") },
  });
  const registrations = [];
  const client = Object.fromEntries(["addFilePanel", "addSettingsScreen"].map((name) => [name, (value) => {
    registrations.push({ name, ...value });
    return () => disposed.push(name);
  }]));
  const cleanup = contribute(client);
  assert.deepEqual(registrations.map(({ name, id }) => [name, id]), [["addFilePanel", "officecli"], ["addSettingsScreen", "officecli"]]);
  assert.equal(registrations[0].Component({}).props.beginSelection, selections.begin);
  assert.deepEqual(registrations[0].files.extensions, ["docx", "xlsx", "pptx"], "no unsupported PDF entry is added");
  cleanup();
  assert.deepEqual(disposed, ["addFilePanel", "addSettingsScreen", "selection", "modeStorage"]);
});

test("file preview preserves watch editing alongside advanced commands", () => {
  for (const extension of ["xlsx", "docx", "pptx"]) {
    const h = surface("client/preview.tsx");
    const file = { path: `/work/test.${extension}`, name: `test.${extension}` };
    const render = () => h.render({ file });
    let tree = render();
    assert.equal(tree.some((node) => node.type === "WatchEditor"), extension !== "xlsx");
    assert.equal(h.queries.get("officecli.preview").enabled, extension === "xlsx");
    if (extension !== "xlsx") {
      button(tree, "阅读模式").props.onPress();
      tree = render();
      assert.equal(tree.some((node) => node.type === "WatchEditor"), false);
    }
    const interact = button(tree, extension === "xlsx" ? "编辑模式" : "选择模式");
    assert.match(interact.props.hint, extension === "xlsx" ? /双击/ : /不能原位编辑文本/);
    interact.props.onPress();
    tree = render();
    const editor = tree.find((node) => node.type === "WatchEditor");
    assert.equal(editor.props.file, file);
    const actions = [];
    const chrome = { save: () => actions.push("save"), reload: () => actions.push("reload"), label: "保存", disabled: false, error: null };
    editor.props.onChrome(chrome);
    tree = render();
    button(tree, "保存").props.onPress();
    button(tree, "重载").props.onPress();
    assert.deepEqual(actions, ["save", "reload"]);
    h.statusQuery.data.capabilities.save = { status: "missing", diagnostic: "当前 help 明确缺少 save" };
    tree = render();
    assert.equal(button(tree, "保存").props.disabled, true);
    assert.equal(tree.find((node) => node.props?.accessibilityRole === "alert").props.children, "当前 help 明确缺少 save");
    h.statusQuery.data.capabilities.save.status = "supported";
    editor.props.onChrome({ ...chrome, label: "保存中", disabled: true, error: "保存失败" });
    tree = render();
    assert.equal(button(tree, "保存中").props.disabled, true);
    assert.equal(tree.find((node) => node.props?.accessibilityRole === "alert").props.children, "保存失败");
    button(tree, "高级命令").props.onPress();
    tree = render();
    assert.equal(tree.some((node) => node.type === "WatchEditor"), false);
    const console = tree.find((node) => node.type === "CommandConsole");
    assert.equal(console.props.path, file.path);
    assert.equal(console.props.layout, props.layout);
    assert.equal(button(tree, "保存"), undefined, "watch controls do not leak into advanced commands");
    assert.equal(h.modeStore.getSnapshot()[extension], "watch", "commands never replace the saved mode");
    button(tree, "返回文档").props.onPress();
    tree = render();
    assert.ok(tree.some((node) => node.type === "WatchEditor"));
    button(tree, "阅读模式").props.onPress();
    tree = render();
    assert.ok(button(tree, "刷新预览"));
    assert.equal(tree.some((node) => node.type === "WatchEditor" || node.type === "CommandConsole"), false);
    button(tree, "高级命令").props.onPress();
    button(render(), "返回文档").props.onPress();
    assert.ok(button(render(), "刷新预览"), "commands return to reading when entered from reading");
  }
});

test("settings and file panels share per-type preferences without inventing Excel selection or PDF support", () => {
  const settings = surface("client/settings.tsx");
  settings.query.data = installation();
  const preview = surface("client/preview.tsx");
  preview.modeStore = settings.modeStore;
  const file = { path: "/work/one.docx", name: "one.docx" };
  const select = (type) => settings.render().find((node) => node.type === "SettingsSelect" && node.props.label.includes(`.${type}`));
  assert.equal(select("docx").props.value, "watch");
  assert.equal(select("pptx").props.value, "watch");
  assert.equal(select("xlsx").props.value, "preview");
  assert.deepEqual(select("xlsx").props.options.map((option) => option.label), ["阅读模式", "编辑模式"]);
  assert.deepEqual(select("docx").props.options.map((option) => option.label), ["选择模式", "阅读模式"]);
  assert.equal(settings.render().filter((node) => node.type === "SettingsSelect").length, 4);
  select("docx").props.onValueChange("preview");
  assert.ok(button(preview.render({ file }), "选择模式"));
  button(preview.render({ file }), "选择模式").props.onPress();
  assert.equal(select("docx").props.value, "watch");
  assert.equal(select("xlsx").props.value, "preview");
  button(preview.render({ file }), "阅读模式").props.onPress();
  assert.ok(button(preview.render({ file: { path: "/other/two.docx" } }), "选择模式"));
  assert.ok(preview.render({ file: { path: "/other/two.pptx" } }).some((node) => node.type === "WatchEditor"));
  assert.deepEqual(settings.calls, [], "mode settings do not save daemon settings or call OfficeCLI");
});

test("default selection never starts a watch before installation is ready and compatible", () => {
  for (const scenario of ["old", "unknown", "pending", "error"]) {
    const h = surface("client/preview.tsx");
    if (scenario === "old") h.statusQuery.data.compatibility = "upgrade-required";
    if (scenario === "unknown") h.statusQuery.data.compatibility = "unknown";
    if (scenario === "pending") { h.statusQuery.isPending = true; h.statusQuery.data = undefined; }
    if (scenario === "error") { h.statusQuery.isError = true; h.statusQuery.error = new Error("offline"); }
    const tree = h.render({ file: { path: "/work/test.docx" } });
    assert.equal(tree.some((node) => node.type === "WatchEditor"), false, scenario);
    assert.equal(h.queries.get("officecli.preview").enabled, false);
    assert.ok(button(tree, "阅读模式"), "read-only mode stays reachable for diagnosis");
    assert.ok(button(tree, "高级命令"));
  }
  const h = surface("client/preview.tsx");
  h.statusQuery.data.capabilities.htmlPreview.status = "missing";
  assert.ok(h.render({ file: { path: "/work/test.docx" } }).some((node) => node.type === "WatchEditor"), "view-html support is not a requirement for watch");
});

test("mode errors stay localized and usable, and language changes preserve the selected mode", () => {
  const h = surface("client/preview.tsx");
  h.modeStore = createModeStore(() => undefined);
  const file = { path: "/work/test.docx" };
  button(h.render({ file }), "阅读模式").props.onPress();
  const before = h.modeStore.getSnapshot();
  let changes = 0;
  h.modeStore.subscribe(() => changes++);
  for (const locale of locales) {
    h.locale = locale;
    const tree = h.render({ file });
    assert.equal(h.modeStore.getSnapshot(), before);
    assert.ok(button(tree, translations(locale).t("selectionMode")));
    assert.ok(tree.some((node) => node.props?.accessibilityRole === "alert" && node.props.children === translations(locale).t("modeStorageUnavailable")));
    assert.deepEqual(h.queries.get("officecli.preview").queryKey, ["officecli.preview", "workspace", file.path, undefined]);
  }
  assert.equal(changes, 0);
  const settings = surface("client/settings.tsx");
  settings.query.data = installation(); settings.modeStore = h.modeStore;
  const selectors = settings.render().filter((node) => node.type === "SettingsSelect" && node.props.label.includes(".docx"));
  assert.equal(selectors[0].props.value, "preview");
  assert.equal(selectors[0].props.error, translations("zh-CN").t("modeStorageUnavailable"));
  assert.deepEqual(h.calls, []);
});

test("action buttons preserve accessibility hints", () => {
  const jsx = (type, props) => ({ type, props });
  const { ActionButton } = load("client/controls.tsx", {
    react: { useState: () => [false, () => {}] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
    "@getpaseo/plugin/client/ui": { Icon: "Icon" },
  });
  const control = ActionButton({ theme, label: "保存", hint: "调用官方 save", onPress() {} });
  assert.equal(control.props.accessibilityHint, "调用官方 save");
});

test("settings defaults to auto-detection and shows save only after an edit", () => {
  const h = surface("client/settings.tsx");
  h.query.data = installation();
  let tree = h.render();
  const path = tree.find((node) => node.type === "SettingsInput");
  assert.equal(path.props.initialValue, "");
  assert.equal(path.props.placeholder, "自动查找");
  const save = (nodes) => nodes.find((node) => node.type === "SettingsAction" && node.props.label === "保存更改");
  assert.equal(save(tree), undefined);
  path.props.onChangeText("/opt/officecli");
  tree = h.render();
  assert.equal(save(tree).props.disabled, false);
  tree.find((node) => node.type === "SettingsInput").props.onChangeText("");
  assert.equal(save(h.render()), undefined);
  h.query.isError = true;
  h.query.error = new Error("Not found");
  const input = h.render().find((node) => node.type === "SettingsInput");
  assert.equal(input.props.error, "Not found");
  assert.doesNotMatch(input.props.hint, /1\.0\.160/);
});

test("settings explains the support policy and can recheck the actual path and version", () => {
  const h = surface("client/settings.tsx");
  h.query.data = installation({ executable: "/opt/officecli", version: "1.0.100", compatibility: "upgrade-required", diagnostic: "需要升级至 1.0.160；文档执行已停止。" });
  let rechecks = 0;
  h.query.refetch = () => { rechecks++; };
  let tree = h.render();
  const policy = tree.find((node) => node.type === "SettingsRow" && node.props.label === "支持版本");
  assert.match(policy.props.hint, /1\.0\.160/);
  assert.match(policy.props.hint, /升级.*官方稳定版/);
  assert.match(policy.props.hint, /公开接口兼容.*可能需要更新插件/);
  assert.match(tree.find((node) => node.type === "SettingsInput").props.hint, /1\.0\.100.*\/opt\/officecli/);
  assert.equal(tree.find((node) => node.type === "ExternalLink").props.href, "https://github.com/iOfficeAI/OfficeCLI#installation");
  const recheck = tree.find((node) => node.type === "SettingsAction" && node.props.label === "检测路径、版本和能力");
  recheck.props.onPress();
  assert.equal(rechecks, 1);
  h.query.isFetching = true;
  tree = h.render();
  assert.equal(tree.find((node) => node.type === "SettingsAction" && node.props.label === "检测路径、版本和能力").props.disabled, true);
  h.query.isFetching = false;
  h.query.data = installation({ executable: "/new/officecli" });
  assert.match(h.render().find((node) => node.type === "SettingsInput").props.hint, /1\.0\.160.*\/new\/officecli/);
  h.query.isError = true;
  h.query.error = new Error("Not found");
  assert.ok(h.render().find((node) => node.type === "ExternalLink"));
});

test("file commands require a separate execution confirmation and no empty result or stop control", () => {
  const h = surface("client/commands.tsx");
  let tree = h.render();
  assert.ok(tree.some((node) => node.type === "Text" && typeof node.props.children === "string" && /1\.0\.160.*升级.*官方稳定版.*公开接口兼容.*可能需要更新插件/.test(node.props.children)));
  assert.equal(button(tree, "停止命令"), undefined);
  assert.equal(button(tree, "复制完整输出"), undefined);
  assert.equal(tree.find((node) => node.type === "Disclosure").props.open, false);
  button(tree, "运行命令").props.onPress();
  tree = h.render();
  assert.equal(tree.find((node) => node.type === h.Modal).props.open, true);
  const warning = tree.find((node) => node.type === "Text" && typeof node.props.children === "string" && node.props.children.includes("命令以宿主账户执行"));
  assert.match(warning.props.children, /备份/);
  assert.match(warning.props.children, /执行失败.*非零退出.*停止.*超限.*不等于撤销/);
  assert.equal(h.calls.length, 0);
  button(tree, "取消").props.onPress();
  assert.equal(h.render().find((node) => node.type === h.Modal).props.open, false);
  assert.equal(h.calls.length, 0);
  button(h.render(), "运行命令").props.onPress();
  button(h.render(), "确认运行").props.onPress();
  assert.deepEqual(h.calls, [{ operation: "start", input: { workspaceId: "workspace", args: ["get", "/work/test.docx", "/", "--json"], input: "", keepStdinOpen: false, confirmed: true } }]);
});

test("invalid or unavailable commands stay blocked; running jobs expose only useful controls", () => {
  const h = surface("client/commands.tsx");
  h.render().find((node) => node.type === "TextInput").props.onChangeText("invalid");
  assert.equal(button(h.render(), "运行命令").props.disabled, true);
  button(h.render(), "查看帮助").props.onPress();
  h.query.isError = true;
  h.query.error = new Error("Offline");
  assert.equal(button(h.render(), "运行命令").props.disabled, true);
  assert.ok(button(h.render(), "重试"));
  h.query.isError = false;
  h.query.error = null;
  h.query.data.job = { id: "job", status: "running", stdinOpen: true, stdout: "", stderr: "", exitCode: null };
  let tree = h.render();
  assert.equal(button(tree, "运行命令"), undefined);
  assert.ok(button(tree, "停止命令"));
  assert.equal(tree.find((node) => node.type === "TextInput").props.editable, false);
  button(tree, "停止命令").props.onPress();
  assert.deepEqual(h.calls.at(-1), { operation: "stop", input: { workspaceId: "workspace", jobId: "job" } });
  h.query.data.job.status = "completed";
  h.query.data.job.exitCode = 0;
  tree = h.render();
  assert.equal(button(tree, "停止命令"), undefined);
  assert.ok(button(tree, "复制完整输出"));
});

test("settings show tri-state capabilities and explicitly refresh the installed binary", () => {
  const h = surface("client/settings.tsx");
  h.query.data = installation({ version: "3.0.0" });
  h.query.data.capabilities.htmlPreview = { status: "missing", diagnostic: "view modes do not include html" };
  h.query.data.capabilities.batch = { status: "unknown", diagnostic: "help JSON changed" };
  const tree = h.render();
  const rows = tree.filter((node) => node.type === "SettingsRow");
  assert.match(rows.find((node) => node.props.label === "HTML 预览").props.hint, /明确缺失.*view modes/);
  assert.match(rows.find((node) => node.props.label === "批处理快捷入口").props.hint, /未知.*JSON changed/);
  assert.match(rows.find((node) => node.props.label === "MCP 快捷入口").props.hint, /帮助声明支持/);
  h.queries.get("officecli.status").queryFn();
  assert.deepEqual(h.calls.at(-1), { operation: "status", input: { refresh: true } });
});

test("old-version commands are disabled with upgrade guidance and a manual recheck", () => {
  const h = surface("client/commands.tsx");
  h.query.data.installation = installation({ version: "1.0.159", compatibility: "upgrade-required", diagnostic: "需要升级：低于 1.0.160；文档执行已停止。" });
  let rechecks = 0;
  h.query.refetch = () => { rechecks++; };
  const tree = h.render();
  for (const label of ["运行命令", "查看文档结构", "查看帮助", "批处理", "MCP"]) assert.equal(button(tree, label).props.disabled, true);
  assert.match(tree.find((node) => node.props?.accessibilityRole === "alert").props.children, /需要升级/);
  assert.equal(tree.find((node) => node.type === "ExternalLink").props.href, "https://github.com/iOfficeAI/OfficeCLI#installation");
  button(tree, "重新检测").props.onPress();
  assert.deepEqual(h.calls, [{ operation: "status", input: { refresh: true } }]);
  const refreshed = installation();
  h.mutations[0].onSuccess(refreshed);
  assert.equal(rechecks, 1);
  assert.equal(h.statusQuery.data, refreshed);
  assert.equal(h.query.data.installation.compatibility, "upgrade-required");
  h.query.data.job = { id: "job", status: "running", stdinOpen: true, stdout: "", stderr: "", exitCode: null };
  const running = h.render();
  assert.equal(button(running, "发送输入").props.disabled, true);
  assert.equal(button(running, "结束输入（EOF）").props.disabled, true);
  assert.equal(button(running, "停止命令").props.disabled, false);
});

test("missing helpers and unknown detection never become a generic command allowlist", () => {
  for (const compatibility of ["supported", "unknown"]) {
    const h = surface("client/commands.tsx");
    const status = h.query.data.installation;
    status.compatibility = compatibility;
    status.capabilities.get = { status: "missing", diagnostic: "unknown command 'get'" };
    status.capabilities.batch = { status: "unknown", diagnostic: "help unavailable" };
    let tree = h.render();
    assert.equal(button(tree, "查看文档结构").props.disabled, true);
    assert.equal(button(tree, "批处理").props.disabled, false);
    tree.find((node) => node.type === "TextInput").props.onChangeText('["future-command","--new-flag","a & b"]');
    tree = h.render();
    assert.equal(button(tree, "运行命令").props.disabled, false);
    button(tree, "运行命令").props.onPress();
    button(h.render(), "确认运行").props.onPress();
    assert.deepEqual(h.calls.at(-1).input.args, ["future-command", "--new-flag", "a & b"]);
    assert.equal(h.calls.at(-1).input.confirmed, true);
    h.mutations[1].onSuccess({ cwd: "/work", executable: "/bin/officecli", id: "job" });
    assert.equal(h.query.data.installation, status);
  }
});

test("preview blocks old or unknown versions and missing HTML, but not unknown help", () => {
  for (const scenario of ["old", "version-unknown", "html-missing", "help-unknown"]) {
    const h = surface("client/preview.tsx");
    const status = h.statusQuery.data;
    h.modeStore.set("docx", "preview");
    const file = { path: "/work/test.docx", name: "test.docx" };
    if (scenario === "old") { status.compatibility = "upgrade-required"; status.diagnostic = "需要升级 1.0.160"; }
    if (scenario === "version-unknown") { status.compatibility = "unknown"; status.diagnostic = "无法识别版本"; }
    if (scenario.startsWith("html") || scenario === "help-unknown") status.capabilities.htmlPreview = { status: scenario === "html-missing" ? "missing" : "unknown", diagnostic: `${scenario} diagnostic` };
    const tree = h.render({ file });
    assert.equal(h.queries.get("officecli.preview").enabled, scenario === "help-unknown");
    assert.equal(button(tree, "高级命令").props.disabled, undefined);
    assert.equal(button(tree, "选择模式").props.disabled, ["old", "version-unknown"].includes(scenario));
    assert.ok(tree.some((node) => node.props?.accessibilityRole === "alert"));
    if (scenario === "old") assert.ok(tree.find((node) => node.type === "ExternalLink"));
  }
});

test("preview manual refresh re-detects capabilities before requesting HTML", () => {
  const h = surface("client/preview.tsx");
  let renders = 0;
  h.modeStore.set("docx", "preview");
  h.query.refetch = () => { renders++; };
  const tree = h.render({ file: { path: "/work/test.docx" } });
  h.queries.get("officecli.status").queryFn();
  assert.deepEqual(h.calls.at(-1), { operation: "status", input: {} });
  h.statusQuery.data.capabilities.htmlPreview.status = "missing";
  button(tree, "刷新预览").props.onPress();
  assert.deepEqual(h.calls.at(-1), { operation: "status", input: { refresh: true } });
  const recheck = h.mutations[0];
  recheck.onSuccess(h.statusQuery.data);
  assert.equal(renders, 0);
  h.statusQuery.data.capabilities.htmlPreview.status = "supported";
  recheck.onSuccess(h.statusQuery.data);
  assert.equal(renders, 1);
});

test("four-language rerenders preserve argv/stdin, confirmation, running job identity and raw output", () => {
  const h = surface("client/commands.tsx");
  const args = '["future-command","日本語 path.docx"]', input = '原文 stdin {{name}}';
  let tree = h.render();
  tree.find((node) => node.props?.accessibilityLabel === "OfficeCLI 命令参数").props.onChangeText(args);
  tree.find((node) => node.props?.accessibilityLabel === "OfficeCLI 输入内容").props.onChangeText(input);
  button(h.render(), "运行命令").props.onPress();
  for (const locale of locales) {
    h.locale = locale; tree = h.render();
    const inputs = tree.filter((node) => node.type === "TextInput");
    assert.deepEqual(inputs.map((node) => node.props.value), [args, input]);
    assert.equal(tree.find((node) => node.type === h.Modal).props.open, true);
    assert.ok(button(tree, translations(locale).t("confirmRun")));
  }
  const job = { id: "still-running", status: "running", stdinOpen: true, stdout: '原始 stdout <&> {{save}}', stderr: 'raw CLI error', exitCode: null };
  h.query.data.job = job;
  for (const locale of locales) {
    h.locale = locale; tree = h.render();
    assert.equal(h.query.data.job, job);
    assert.equal(h.queries.get("officecli.command").queryKey[1], "workspace");
    assert.deepEqual(tree.filter((node) => node.type === "TextInput").map((node) => node.props.value), [args, input]);
    assert.ok(tree.some((node) => node.type === "Text" && Array.isArray(node.props.children) && node.props.children[0] === job.stdout));
  }
  assert.deepEqual(h.calls, [], "language changes do not execute, send, save or stop anything");
});

test("the native language selector exposes autonyms and preserves an unsaved executable path", () => {
  const h = surface("client/settings.tsx"); h.query.data = installation();
  h.render().find((node) => node.type === "SettingsInput").props.onChangeText("/unsaved/path");
  for (const locale of locales) {
    h.locale = locale;
    const tree = h.render();
    const selector = tree.find((node) => node.type === "SettingsSelect");
    assert.deepEqual(selector.props.options.slice(1).map((option) => option.label), locales.map((key) => languageNames[key]));
    assert.ok(tree.find((node) => node.type === "SettingsAction" && node.props.label === translations(locale).t("saveChanges")));
  }
  assert.deepEqual(h.calls, []);
});
