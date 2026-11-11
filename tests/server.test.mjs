import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import ts from "typescript";
import { InstallationInspector, requireInstallation } from "../server/installation.ts";
import { message, displayMessage } from "../shared/messages.ts";

function server(version = "1.0.160") {
  const h = { version, executable: "/bin/officecli", probes: [], executions: [], handlers: new Map(), help: {} };
  const rpcNames = ["statusRpc", "previewRpc", "commandStateRpc", "commandStartRpc", "commandInputRpc", "commandStopRpc", "watchOpenRpc", "watchRequestRpc", "watchEventsRpc", "watchSaveRpc", "watchCloseRpc"];
  const operation = (name) => (...args) => { h.executions.push({ name, args }); return { id: "job", html: "<html><head></head></html>" }; };
  const mocks = {
    "node:fs/promises": { realpath },
    "./shared/messages": { message },
    "./shared/officecli": Object.fromEntries(["officeSettings", ...rpcNames].map((key) => [key, key])),
    "./server/officecli": {
      resolveExecutable: async () => h.executable,
      resolveDocument: async (_, path) => path,
      renderDocument: operation("render"),
      CommandRunner: class {
        start = operation("start"); get = () => null; input = operation("input"); stop = operation("stop"); dispose() {}
      },
    },
    "./server/installation": {
      requireInstallation,
      InstallationInspector: class extends InstallationInspector {
        constructor() {
          super(async (executable, args) => {
            h.probes.push({ executable, args });
            if (args[0] === "--version") return h.version;
            const name = args.length === 2 ? "" : args[1];
            const output = h.help[name];
            if (output instanceof Error) throw output;
            return output ?? JSON.stringify(name ? { command: name, modes: ["html"] } : { commands: ["get", "batch", "save", "mcp"] });
          });
        }
      },
    },
    "./server/watch": {
      WatchManager: class {
        open = operation("open"); request = operation("request"); events = operation("events"); save = operation("save"); close = operation("close"); async dispose() {}
      },
    },
  };
  const source = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (name) => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  });
  h.dispose = exports.default({
    registerSettings: () => ({ read: async () => ({ status: "ready", values: { executable: h.executable } }) }),
    handle: (rpc, handler) => h.handlers.set(rpc, handler),
  });
  const context = { paseo: { workspaces: { ref: () => ({ refresh: async () => ({ workspaceDirectory: process.cwd() }) }) } } };
  h.call = async (rpc, input = {}) => {
    try { return await h.handlers.get(rpc)({ workspaceId: "workspace", path: "/work/test.docx", ...input }, context); }
    catch (error) { throw new Error(displayMessage("zh-CN", error)); }
  };
  return h;
}

test("RPC entrypoints reject old document execution without issuing any help or behavior probe", async () => {
  const h = server("1.0.159");
  try {
    assert.equal((await h.call("statusRpc")).compatibility, "upgrade-required");
    assert.equal((await h.call("commandStateRpc")).installation.compatibility, "upgrade-required");
    for (const rpc of ["previewRpc", "commandStartRpc", "commandInputRpc", "watchOpenRpc", "watchRequestRpc", "watchSaveRpc"]) await assert.rejects(h.call(rpc, { args: ["help"], input: "", keepStdinOpen: false, confirmed: true }), /需要升级/);
    assert.deepEqual(h.executions, []);
    assert.ok(h.probes.every((probe) => JSON.stringify(probe.args) === '["--version"]'));
    await h.call("commandStopRpc", { jobId: "job" });
    await h.call("watchCloseRpc", { leaseId: "lease" });
    assert.deepEqual(h.executions.map((call) => call.name), ["stop", "close"]);
  } finally { await h.dispose(); }
});

test("explicitly missing automatic HTML/save interfaces do not restrict generic argv, stdin or EOF", async () => {
  const h = server("2.0.0");
  h.help.view = JSON.stringify({ command: "view", modes: ["text"] });
  h.help.save = JSON.stringify({ command: "save", supported: false });
  try {
    await assert.rejects(h.call("previewRpc"), /明确不支持 view html/);
    await assert.rejects(h.call("watchSaveRpc"), /明确不支持 save/);
    assert.deepEqual(h.executions, []);
    const args = ["future-command", "--new-argument", "a & b", "$(unchanged)", "C:\\path with spaces\\file.docx"];
    const input = '{"exact":"stdio"}\n';
    await h.call("commandStartRpc", { args, input, keepStdinOpen: true, confirmed: true });
    const call = h.executions.at(-1);
    assert.equal(call.name, "start");
    assert.deepEqual(call.args, ["workspace", await realpath(process.cwd()), h.executable, args, input, true]);
    await h.call("commandInputRpc", { jobId: "job", input: "next\n", eof: true });
    assert.deepEqual(h.executions.at(-1), { name: "input", args: ["workspace", "job", "next\n", true] });
    const helpCount = h.probes.filter((probe) => probe.args[0] === "help").length;
    await h.call("commandStateRpc");
    assert.equal(h.probes.filter((probe) => probe.args[0] === "help").length, helpCount);
  } finally { await h.dispose(); }
});

test("unknown help preserves automatic execution attempts; unknown version keeps confirmed generic diagnostics", async () => {
  const h = server();
  for (const key of ["", "view", "get", "batch", "save", "mcp"]) h.help[key] = new Error("help unavailable (exit 8)");
  try {
    const status = await h.call("statusRpc");
    assert.equal(status.compatibility, "supported");
    assert.equal(status.capabilities.htmlPreview.status, "unknown");
    await h.call("previewRpc");
    assert.equal(h.executions.at(-1).name, "render");
    h.version = "OfficeCLI future version format";
    await assert.rejects(h.call("previewRpc"), /最低版本尚未确认/);
    await h.call("commandStartRpc", { args: ["new-command"], input: "", keepStdinOpen: false, confirmed: true });
    assert.equal(h.executions.at(-1).name, "start");
    assert.equal(h.probes.at(-1).args[0], "--version");
  } finally { await h.dispose(); }
});

test("RPC manual refresh notices replacement at the same path and version", async () => {
  const h = server();
  try {
    assert.equal((await h.call("statusRpc")).capabilities.htmlPreview.status, "supported");
    h.help.view = JSON.stringify({ command: "view", modes: ["text"] });
    assert.equal((await h.call("statusRpc")).capabilities.htmlPreview.status, "supported");
    assert.equal((await h.call("statusRpc", { refresh: true })).capabilities.htmlPreview.status, "missing");
    h.executable = "/replacement/officecli";
    assert.equal((await h.call("commandStateRpc")).executable, h.executable);
    assert.equal(h.probes.at(-1).executable, h.executable);
  } finally { await h.dispose(); }
});
