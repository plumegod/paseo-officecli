import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { MAX_INPUT_CHARS, parseArguments } from "../shared/commands.ts";

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
    query: { data: { directory: "/work", executable: "/bin/officecli", installation: installation(), job: null }, isPending: false, isError: false, refetch() {} },
    statusQuery: { data: installation(), isPending: false, isError: false, async refetch() { return { data: this.data }; } },
    queries: new Map(), mutations: [],
    settings: { status: "ready", values: { executable: "" }, revision: 1, saving: false },
  };
  const jsx = (type, props) => ({ type, props });
  const component = load(path, {
    react: { useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === "function" ? initial() : initial; return [values[i], (value) => { values[i] = value; }]; }, useEffect() {} },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Text: "Text", View: "View" },
    "@getpaseo/plugin/client": { useRpc: (operation) => (input) => calls.push({ operation, input }), useSettings: () => h.settings },
    "@getpaseo/plugin/client/ui": { Modal, Loading: "Loading", ScrollView: "ScrollView", TextInput: "TextInput", SettingsSwitch: "SettingsSwitch", SettingsCard: "SettingsCard", SettingsSection: "SettingsSection", SettingsInput: "SettingsInput", SettingsAction: "SettingsAction", SettingsRow: "SettingsRow", ExternalLink: "ExternalLink", copyText: async () => {} },
    "@tanstack/react-query": {
      useQuery: (options) => { h.queries.set(options.queryKey[0], options); return path === "client/preview.tsx" && options.queryKey[0] === "officecli.status" ? h.statusQuery : h.query; },
      useMutation: (options) => { h.mutations.push(options); return { mutate: (...args) => options.mutationFn(...args), isPending: false, reset() {} }; },
      useQueryClient: () => ({ setQueryData: (key, value) => { (key[0] === "officecli.status" ? h.statusQuery : h.query).data = value; }, invalidateQueries() {} }),
    },
    "../shared/officecli": { officeSettings: {}, statusRpc: "status", previewRpc: "preview", commandStateRpc: "state", commandStartRpc: "start", commandInputRpc: "input", commandStopRpc: "stop" },
    "../shared/commands": { MAX_INPUT_CHARS, parseArguments },
    "./controls": { ActionButton: "ActionButton", Disclosure: "Disclosure" },
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
  });
  const registrations = [];
  const client = Object.fromEntries(["addFilePanel", "addSettingsScreen"].map((name) => [name, (value) => {
    registrations.push({ name, ...value });
    return () => disposed.push(name);
  }]));
  const cleanup = contribute(client);
  assert.deepEqual(registrations.map(({ name, id }) => [name, id]), [["addFilePanel", "officecli"], ["addSettingsScreen", "officecli"]]);
  assert.equal(registrations[0].Component({}).props.beginSelection, selections.begin);
  cleanup();
  assert.deepEqual(disposed, ["addFilePanel", "addSettingsScreen", "selection"]);
});

test("file preview preserves watch editing alongside advanced commands", () => {
  for (const extension of ["xlsx", "docx", "pptx"]) {
    const h = surface("client/preview.tsx");
    const file = { path: `/work/test.${extension}`, name: `test.${extension}` };
    const render = () => h.render({ file });
    let tree = render();
    assert.equal(tree.some((node) => node.type === "WatchEditor" || node.type === "CommandConsole"), false);
    const interact = button(tree, extension === "xlsx" ? "交互编辑" : "实时预览/选择");
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
    button(tree, "返回预览").props.onPress();
    tree = render();
    assert.ok(button(tree, "刷新预览"));
    assert.equal(tree.some((node) => node.type === "WatchEditor" || node.type === "CommandConsole"), false);
  }
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
    const file = { path: "/work/test.docx", name: "test.docx" };
    if (scenario === "old") { status.compatibility = "upgrade-required"; status.diagnostic = "需要升级 1.0.160"; }
    if (scenario === "version-unknown") { status.compatibility = "unknown"; status.diagnostic = "无法识别版本"; }
    if (scenario.startsWith("html") || scenario === "help-unknown") status.capabilities.htmlPreview = { status: scenario === "html-missing" ? "missing" : "unknown", diagnostic: `${scenario} diagnostic` };
    const tree = h.render({ file });
    assert.equal(h.queries.get("officecli.preview").enabled, scenario === "help-unknown");
    assert.equal(button(tree, "高级命令").props.disabled, undefined);
    assert.equal(button(tree, "实时预览/选择").props.disabled, ["old", "version-unknown"].includes(scenario));
    assert.ok(tree.some((node) => node.props?.accessibilityRole === "alert"));
    if (scenario === "old") assert.ok(tree.find((node) => node.type === "ExternalLink"));
  }
});

test("preview manual refresh re-detects capabilities before requesting HTML", () => {
  const h = surface("client/preview.tsx");
  let renders = 0;
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
