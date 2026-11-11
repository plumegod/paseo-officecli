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

function surface(path) {
  const values = [];
  let cursor = 0;
  const calls = [];
  const Modal = Object.assign(() => {}, { Content: "ModalContent" });
  const h = {
    calls,
    Modal,
    query: { data: { directory: "/work", executable: "/bin/officecli", job: null }, isPending: false, isError: false, refetch() {} },
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
      useQuery: () => h.query,
      useMutation: (options) => ({ mutate: (...args) => options.mutationFn(...args), isPending: false, reset() {} }),
      useQueryClient: () => ({ setQueryData: (_, value) => { h.query.data = value; }, invalidateQueries() {} }),
    },
    "../shared/officecli": { officeSettings: {}, statusRpc: "status", previewRpc: "preview", commandStateRpc: "state", commandStartRpc: "start", commandInputRpc: "input", commandStopRpc: "stop" },
    "../shared/commands": { MAX_INPUT_CHARS, parseArguments },
    "./controls": { ActionButton: "ActionButton", Disclosure: "Disclosure" },
    "./commands": { CommandConsole: "CommandConsole" },
    "./watch": { WatchEditor: "WatchEditor" },
    "./web": { supportsPreview: true, createPreviewUrl() {}, revokePreviewUrl() {}, PreviewFrame: "PreviewFrame" },
  });
  h.render = (overrides = {}) => { cursor = 0; return nodes(Object.values(component)[0]({ ...props, ...overrides })); };
  return h;
}

const button = (tree, label) => tree.find((node) => node.type === "ActionButton" && node.props.label === label);

test("navigation registers only a file panel and native settings", () => {
  const { default: contribute } = load("index.client.tsx", { "./client/preview": { OfficePreview: "Preview" }, "./client/settings": { OfficeSettings: "Settings" } });
  const registrations = [];
  const disposed = [];
  const client = Object.fromEntries(["addFilePanel", "addSettingsScreen"].map((name) => [name, (value) => {
    registrations.push({ name, ...value });
    return () => disposed.push(name);
  }]));
  const cleanup = contribute(client);
  assert.deepEqual(registrations.map(({ name, id }) => [name, id]), [["addFilePanel", "officecli"], ["addSettingsScreen", "officecli"]]);
  cleanup();
  assert.deepEqual(disposed, ["addFilePanel", "addSettingsScreen"]);
});

test("file preview preserves watch editing alongside advanced commands", () => {
  for (const extension of ["xlsx", "docx", "pptx"]) {
    const h = surface("client/preview.tsx");
    const file = { path: `/work/test.${extension}`, name: `test.${extension}` };
    const render = () => h.render({ file });
    let tree = render();
    assert.equal(tree.some((node) => node.type === "WatchEditor" || node.type === "CommandConsole"), false);
    button(tree, extension === "xlsx" ? "交互编辑" : "实时预览/选择").props.onPress();
    tree = render();
    assert.equal(tree.find((node) => node.type === "WatchEditor").props.file, file);
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

test("settings defaults to auto-detection and shows save only after an edit", () => {
  const h = surface("client/settings.tsx");
  h.query.data = { executable: "/bin/officecli", version: "1.0.160" };
  let tree = h.render();
  const path = tree.find((node) => node.type === "SettingsInput");
  assert.equal(path.props.initialValue, "");
  assert.equal(path.props.placeholder, "自动查找");
  assert.equal(tree.some((node) => node.type === "SettingsAction"), false);
  path.props.onChangeText("/opt/officecli");
  tree = h.render();
  assert.equal(tree.find((node) => node.type === "SettingsAction").props.disabled, false);
  tree.find((node) => node.type === "SettingsInput").props.onChangeText("");
  assert.equal(h.render().some((node) => node.type === "SettingsAction"), false);
  h.query.isError = true;
  h.query.error = new Error("Not found");
  const input = h.render().find((node) => node.type === "SettingsInput");
  assert.equal(input.props.error, "Not found");
  assert.doesNotMatch(input.props.hint, /1\.0\.160/);
});

test("file commands require a separate execution confirmation and no empty result or stop control", () => {
  const h = surface("client/commands.tsx");
  let tree = h.render();
  assert.equal(button(tree, "停止命令"), undefined);
  assert.equal(button(tree, "复制完整输出"), undefined);
  assert.equal(tree.find((node) => node.type === "Disclosure").props.open, false);
  button(tree, "运行命令").props.onPress();
  tree = h.render();
  assert.equal(tree.find((node) => node.type === h.Modal).props.open, true);
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
