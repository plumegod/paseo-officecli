import test from "node:test";
import assert from "node:assert/strict";
import { InstallationInspector, requireInstallation } from "../server/installation.ts";
import { displayMessage } from "../shared/messages.ts";
const display = (value) => displayMessage("zh-CN", value);

function installation(version = "1.0.160") {
  const h = {
    version, calls: [],
    help: {
      "": JSON.stringify({ success: true, data: { commands: ["view", "get", "batch", "save", "mcp"], future: { ignored: true } } }),
      view: JSON.stringify({ success: true, data: { command: "view", modes: ["html", "text"], extra: true } }),
      get: JSON.stringify({ command: "get" }),
      batch: JSON.stringify({ command: "batch", transaction: "not inferred" }),
      save: JSON.stringify({ command: "save" }),
      mcp: JSON.stringify({ command: "mcp" }),
    },
  };
  h.inspector = new InstallationInspector(async (executable, args) => {
    h.calls.push({ executable, args });
    const result = args[0] === "--version" ? h.version : h.help[args.length === 2 ? "" : args[1]];
    if (result instanceof Error) throw result;
    return result;
  });
  h.check = (path = "/bin/officecli", refresh = false) => h.inspector.check(path, refresh);
  return h;
}

const states = (status) => Object.values(status.capabilities).map((value) => value.status);

test("below-baseline installs only run --version and block every execution mode", async () => {
  for (const version of ["0.9.99999", "1.0.159", "1.0.160-preview.1"]) {
    const h = installation(version);
    const status = await h.check();
    assert.equal(status.compatibility, "upgrade-required", version);
    assert.deepEqual(h.calls.map((call) => call.args), [["--version"]]);
    assert.ok(states(status).every((state) => state === "unknown"));
    assert.match(display(status.diagnostic), /1\.0\.160.*官方.*https:\/\/github.com\/iOfficeAI\/OfficeCLI/);
    assert.throws(() => requireInstallation(status), /"code":"upgradeRequired"/);
    assert.throws(() => requireInstallation(status, true), /"code":"upgradeRequired"/);
  }
});

test("baseline and future versions have no upper bound and ignore extra help fields", async () => {
  for (const version of ["1.0.160", "OfficeCLI v1.0.160+build.2", "1.0.161", "2.0.0", "999999999999999999999.0.0"]) {
    const h = installation(version);
    const status = await h.check();
    assert.equal(status.version, version);
    assert.equal(status.compatibility, "supported", version);
    assert.deepEqual(states(status), Array(5).fill("supported"));
    assert.doesNotThrow(() => requireInstallation(status, true));
    assert.equal(h.calls.some((call) => call.args.includes("all")), false);
    assert.ok(h.calls.every((call) => ["--version", "help"].includes(call.args[0])));
    assert.ok(h.calls.some((call) => call.args[1] === "batch"));
    assert.ok(h.calls.some((call) => call.args[1] === "save"));
  }
});

test("unrecognized or failed version checks are unknown, not old, and retain generic diagnostics", async () => {
  for (const version of ["", "OfficeCLI next generation", new Error("version probe crashed (exit 5)")]) {
    const h = installation(version);
    const status = await h.check();
    assert.equal(status.compatibility, "unknown");
    assert.deepEqual(h.calls.map((call) => call.args), [["--version"]]);
    assert.doesNotThrow(() => requireInstallation(status));
    assert.throws(() => requireInstallation(status, true), /"code":"versionUnknown"/);
    assert.match(display(status.diagnostic), /高级命令诊断/);
    if (version instanceof Error) assert.match(status.diagnostic, /exit 5/);
  }
});

test("failed help is unknown and never disables a supported version or generic execution", async () => {
  const h = installation("2.1.0");
  for (const key of Object.keys(h.help)) h.help[key] = new Error("OfficeCLI failed (exit 7): help unavailable");
  const status = await h.check();
  assert.equal(status.compatibility, "supported");
  assert.deepEqual(states(status), Array(5).fill("unknown"));
  assert.match(display(status.diagnostic), /help 不可用.*exit 7/);
  assert.match(status.capabilities.htmlPreview.diagnostic, /exit 7/);
  assert.doesNotThrow(() => requireInstallation(status, true));
});

test("malformed JSON and changed help shapes preserve unknown and their raw diagnostics", async () => {
  const h = installation();
  h.help[""] = '{"newCommands":';
  h.help.view = '{"newModes":';
  h.help.batch = JSON.stringify({ futureCommandInfo: { name: "batch" } });
  h.help.save = JSON.stringify({ success: true, data: [{ element: "paragraph", name: "save" }] });
  h.help.get = "unfamiliar help format";
  h.help.mcp = "";
  const status = await h.check();
  assert.deepEqual(states(status), Array(5).fill("unknown"));
  assert.match(display(status.diagnostic), /全局 help 输出无法识别.*newCommands/);
  assert.match(display(status.capabilities.htmlPreview.diagnostic), /JSON 输出异常.*newModes/);
  assert.match(status.capabilities.batch.diagnostic, /futureCommandInfo/);
  assert.match(status.capabilities.save.diagnostic, /paragraph/);
  assert.match(display(status.capabilities.mcp.diagnostic), /∅/);
});

test("only explicit capability absence is missing; a partial command list is not an allowlist", async () => {
  const h = installation();
  h.help[""] = JSON.stringify({ commands: ["future-command"] });
  h.help.view = JSON.stringify({ command: "view", modes: ["text", "svg"] });
  h.help.batch = JSON.stringify({ name: "batch", supported: false });
  h.help.save = JSON.stringify({ success: false, error: { command: "save", code: "command_not_found" } });
  h.help.mcp = new Error("OfficeCLI failed (exit 1): unknown command 'mcp'");
  h.help.get = new Error("error: unknown format 'get'. Use: officecli help");
  const status = await h.check();
  assert.equal(status.capabilities.htmlPreview.status, "missing");
  for (const name of ["batch", "save", "mcp"]) assert.equal(status.capabilities[name].status, "missing");
  assert.equal(status.capabilities.get.status, "unknown");
  assert.match(status.capabilities.htmlPreview.diagnostic, /modes/);
  assert.doesNotThrow(() => requireInstallation(status));
});

test("current official text help is accepted even when --json is not honored", async () => {
  const h = installation();
  h.help[""] = "Commands:\n  get <file> [<path>] [options]\n  mcp [options]";
  h.help.view = "Usage:\n  officecli view <file> <mode> [options]\nArguments:\n  <mode>  View mode: text, annotated, html, svg, screenshot.";
  h.help.batch = "Usage:\n  officecli batch <file> [options]";
  h.help.save = "Usage:\n  officecli save <file> [options]";
  assert.deepEqual(states(await h.check()), Array(5).fill("supported"));
  h.help.view = "Usage:\n  officecli view <file> <mode> [options]\nArguments:\n  <mode>  View mode: text, svg, screenshot.";
  assert.equal((await h.check("/bin/officecli", true)).capabilities.htmlPreview.status, "missing");
  h.help.view = "Usage:\n  officecli view <file> <mode> [options]\nNew mode discovery protocol.";
  assert.equal((await h.check("/bin/officecli", true)).capabilities.htmlPreview.status, "unknown");
});

test("explicit missing commands in global help are not lost when subcommand help is unavailable", async () => {
  const h = installation();
  h.help[""] = JSON.stringify({ commands: [{ name: "view", supported: false }, { name: "save", supported: false }] });
  h.help.view = h.help.save = new Error("help unavailable");
  const status = await h.check();
  assert.equal(status.capabilities.htmlPreview.status, "missing");
  assert.equal(status.capabilities.save.status, "missing");
  assert.equal(h.calls.some((call) => ["view", "save"].includes(call.args[1])), false);
});

test("cache rechecks version on each execution and invalidates on path, version or manual refresh", async () => {
  const h = installation();
  const helpCount = () => h.calls.filter((call) => call.args[0] === "help").length;
  const original = await h.check();
  const count = helpCount();
  assert.ok(count > 0);
  assert.equal(await h.check(), original);
  assert.equal(helpCount(), count);
  assert.equal(h.calls.filter((call) => call.args[0] === "--version").length, 2);
  h.help.view = JSON.stringify({ command: "view", modes: ["text"] });
  assert.equal((await h.check()).capabilities.htmlPreview.status, "supported");
  assert.equal((await h.check("/bin/officecli", true)).capabilities.htmlPreview.status, "missing");
  assert.equal(helpCount(), count * 2);
  await h.check("/new/officecli");
  assert.equal(helpCount(), count * 3);
  h.version = "1.0.161";
  assert.equal((await h.check("/new/officecli")).version, "1.0.161");
  assert.equal(helpCount(), count * 4);
  h.version = "1.0.159";
  assert.equal((await h.check("/new/officecli")).compatibility, "upgrade-required");
  assert.equal(helpCount(), count * 4);
  h.version = "1.0.161";
  await h.check("/new/officecli");
  assert.equal(helpCount(), count * 5);
});

test("simultaneous checks share help reads, not document behavior probes", async () => {
  const h = installation();
  const [first, second] = await Promise.all([h.check(), h.check()]);
  assert.equal(first, second);
  assert.equal(h.calls.filter((call) => call.args.length === 2 && call.args[0] === "help").length, 1);
});
