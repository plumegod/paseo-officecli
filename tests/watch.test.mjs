import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as tick } from "node:timers/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { watchBridge } from "../client/watch-bridge.ts";
import { WatchManager, officialResult } from "../server/watch.ts";
import { watchRequest, bridgeMessage } from "../shared/watch.ts";

const edit = { route: "/api/send", method: "POST", body: { path: "/Sheet1/A1", prop: "text", value: "中文" } };

test("watch protocol accepts only official cell/drag/selection requests", () => {
  assert.deepEqual(watchRequest.parse(edit), edit);
  watchRequest.parse({ route: "/api/send", method: "POST", body: { path: "/中文 sheet/chart[1]", props: { x: "6", y: "7" } } });
  watchRequest.parse({ route: "/api/selection", method: "POST", body: { paths: ["/body/p[1]", "/slide[1]/shape[@id=100000]"] } });
  for (const request of [
    { route: "http://other/api/send", method: "POST", body: edit.body },
    { route: "/api/switch", method: "POST", body: { file: "secret.xlsx" } },
    { route: "/api/batch", method: "POST", body: [] },
    { ...edit, body: { ...edit.body, command: "remove" } },
    { ...edit, body: { ...edit.body, file: "secret.xlsx" } },
    { ...edit, body: { path: "/body/p[1]", prop: "text", value: "fake Word editor" } },
    { ...edit, body: { path: "/Sheet1/chart[1]", props: { x: "-1", y: "NaN" } } },
    { route: "/", method: "POST", body: {} },
  ]) assert.equal(watchRequest.safeParse(request).success, false);
  assert.equal(bridgeMessage.safeParse({ channel: "fake", id: 1, kind: "events", after: 0 }).success, false);
});

test("transport success never hides an official business failure or unknown result", () => {
  officialResult('{"success":true}');
  officialResult(JSON.stringify({ success: true, message: '{"success":true}' }), true);
  assert.throws(() => officialResult(JSON.stringify({ success: true, message: '{"success":false,"error":{"code":"not_found"}}' }), true), /not_found/);
  for (const result of ["not JSON", "null", "{}", '{"success":false}']) assert.throws(() => officialResult(result));
  assert.throws(() => officialResult('{"success":true,"message":"not JSON"}', true));
});

test("sandbox bridge authenticates replies and relays official fetch/SSE without network access", async () => {
  const channel = "0ced86a2-6515-4f2f-823c-f9def247c191";
  const sent = [], timers = new Map();
  let receive, nextTimer = 0;
  const parent = { postMessage: (message) => sent.push(message) };
  const window = { addEventListener: (_, listener) => { receive = listener; } };
  runInNewContext(watchBridge(channel, 7).slice(8, -9), {
    window, parent, Response, EventTarget, Event, MessageEvent,
    setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  });
  const reply = (message, value) => receive({ source: parent, data: { channel, id: message.id, value } });
  const pending = window.fetch("/api/send", { method: "POST", body: JSON.stringify(edit.body) });
  assert.equal(sent[0].route, "/api/send"); assert.equal(sent[0].method, "POST");
  receive({ source: {}, data: { channel, id: sent[0].id, value: { body: "forged" } } });
  receive({ source: parent, data: { channel: "wrong", id: sent[0].id, value: { body: "forged" } } });
  assert.equal(timers.size, 1, "foreign frame/channel replies cannot resolve a request");
  reply(sent[0], { body: "official response" });
  assert.equal(await (await pending).text(), "official response");
  const rejected = window.fetch("/api/send", { method: "POST", body: "{}" });
  receive({ source: parent, data: { channel, id: sent.at(-1).id, error: "official write failed" } });
  await assert.rejects(rejected, /official write failed/);

  const runPoll = async () => {
    const [id, timer] = [...timers].find(([, timer]) => timer.delay === 0);
    timers.delete(id); void timer.callback(); await tick();
  };
  const source = new window.EventSource("/events");
  let update;
  source.addEventListener("update", (event) => { update = event.data; });
  await runPoll();
  assert.equal(sent.at(-1).after, 7);
  reply(sent.at(-1), { cursor: 8, reload: false, events: [{ id: 8, type: "update", data: "official delta" }] });
  await tick();
  assert.equal(update, "official delta"); assert.equal(source.readyState, 1);
  const replacement = new window.EventSource("/events");
  assert.equal(source.readyState, 2, "official script re-execution closes the old poller");
  await runPoll();
  assert.equal(sent.at(-1).after, 8, "event cursor survives official body refreshes");
  reply(sent.at(-1), { cursor: 9, reload: true, events: [] });
  await tick();
  assert.equal(replacement.readyState, 2); assert.equal(timers.size, 0);
});

test("owned watch lifecycle, authenticated scope and bounded event forwarding", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "officecli-watch-unit-"));
  const paths = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const path = join(root, `中文 ${index}.xlsx`); await writeFile(path, "fixture"); return path;
  }));
  const records = [];
  let startup = "ok", compatible = true;
  const mutable = await import("node:child_process").then((module) => module.default);
  t.mock.method(mutable, "spawn", (executable, args, options) => {
    assert.equal(executable, "official-cli");
    assert.deepEqual(args.slice(2), ["--port", "0"]);
    assert.equal(options.shell, false);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null });
    const record = { child, path: args[1], port: 30000 + records.length, requests: [], result: { success: true, message: '{"success":true}' } };
    records.push(record);
    child.kill = () => { setImmediate(() => { child.signalCode = "SIGTERM"; child.emit("exit", null, "SIGTERM"); }); return true; };
    setImmediate(() => {
      if (startup === "existing") {
        child.stderr.write("Another watch process is already running (user-owned)."); child.exitCode = 1; child.emit("exit", 1, null);
      } else if (startup === "error") child.emit("error", new Error("ENOENT fake executable"));
      else if (startup !== "hang") {
        child.stdout.write("Watch: http://localhost:3");
        setImmediate(() => child.stdout.write(String(record.port).slice(1) + "\n"));
      }
    });
    return child;
  });
  syncBuiltinESMExports();
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const address = new URL(url);
    assert.equal(address.hostname, "127.0.0.1");
    assert.equal(options.redirect, "error");
    const record = records.find((entry) => entry.port === Number(address.port));
    assert.ok(record, "must wait for a complete stdout port line");
    record.requests.push({ route: address.pathname, method: options.method, body: options.body });
    if (address.pathname === "/api/status") return Response.json({ file: record.statusPath ?? record.path });
    if (address.pathname === "/") return new Response(compatible ? "<html><head></head><body><script>new EventSource('/events');fetch('/api/selection')</script></body></html>" : "<html>unsupported</html>");
    if (address.pathname === "/api/send") return Response.json(record.result);
    if (address.pathname === "/api/selection") return new Response(null, { status: 204 });
    assert.equal(address.pathname, "/events");
    const stream = new ReadableStream({ start(controller) {
      record.push = (type, data) => controller.enqueue(Buffer.from(`event: ${type}\ndata: ${data}\n\n`));
      options.signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
    } });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  });
  const manager = new WatchManager();
  t.after(async () => { await manager.dispose(); t.mock.restoreAll(); syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); });

  const [first, second] = await Promise.all([
    manager.open("one", root, paths[0], "official-cli"), manager.open("one", root, paths[0], "official-cli"),
  ]);
  assert.notEqual(first.leaseId, second.leaseId);
  assert.equal(records.length, 1, "same document shares one owned child");
  assert.equal(first.savedRevision, null, "opening does not claim existing resident is saved");
  assert.deepEqual(records[0].requests.filter((item) => item.route === "/api/send"), [], "opening never writes");
  assert.equal((await manager.request("one", root, first.leaseId, { route: "/api/selection", method: "POST", body: { paths: ["/Sheet1/A1"] } })).body, "");
  await assert.rejects(manager.request("other-workspace", root, first.leaseId, edit), /another workspace/);
  await assert.rejects(manager.request("one", tmpdir(), first.leaseId, { ...edit, route: "/api/switch" }));
  await assert.rejects(manager.request("one", root, first.leaseId, { ...edit, body: { ...edit.body, value: "中".repeat(30000) } }), /64 KiB/);
  const changed = await manager.request("one", root, first.leaseId, edit);
  assert.equal(changed.lastWrite, "applied"); assert.equal(changed.savedRevision, null);
  records[0].result = { success: true, message: '{"success":false,"error":"actual CLI failure"}' };
  await assert.rejects(manager.request("one", root, first.leaseId, edit), /actual CLI failure/);
  assert.equal((await manager.events("one", root, first.leaseId, 0)).lastWrite, "unconfirmed");
  for (let index = 0; index < 258; index++) records[0].push("update", JSON.stringify({ action: "selection-update", paths: [], index }));
  await tick();
  const gap = await manager.events("one", root, second.leaseId, 0);
  assert.equal(gap.reload, true); assert.equal(gap.cursor, 258);
  const tail = await manager.events("one", root, second.leaseId, 257);
  assert.equal(tail.events.length, 1); assert.equal(tail.events[0].id, 258);
  await assert.rejects(manager.events("one", root, first.leaseId, 99999), /cursor/);
  await manager.close("one", first.leaseId);
  assert.equal(records[0].child.signalCode, null, "other tab keeps child alive");
  records[0].statusPath = paths[1];
  await assert.rejects(manager.request("one", root, second.leaseId, edit), /changed document/);
  assert.equal(records[0].requests.filter((item) => item.route === "/api/send").length, 2, "never edits retargeted file");
  await manager.close("one", second.leaseId);
  assert.equal(records[0].child.signalCode, "SIGTERM");
  await manager.close("one", second.leaseId); // idempotent, no PID/marker lookup

  const beforeRestart = await manager.open("one", root, paths[0], "official-cli");
  const stopping = manager.close("one", beforeRestart.leaseId);
  const reopened = await manager.open("one", root, paths[0], "official-cli");
  await stopping;
  assert.equal((await manager.events("one", root, reopened.leaseId, 0)).lastWrite, "none", "rapid reopen waits for the previous child to exit");
  await manager.close("one", reopened.leaseId);

  startup = "existing";
  await assert.rejects(manager.open("one", root, paths[0], "official-cli"), /user-owned/);
  startup = "error";
  await assert.rejects(manager.open("one", root, paths[0], "official-cli"), /ENOENT/);
  startup = "ok"; compatible = false;
  await assert.rejects(manager.open("one", root, paths[0], "official-cli"), /Unsupported/);
  compatible = true;
  const opened = await Promise.all(paths.slice(0, 8).map((path) => manager.open("one", root, path, "official-cli")));
  await assert.rejects(manager.open("one", root, paths[8], "official-cli"), /Eight documents/);
  const target = await realpath(paths[7]);
  const crashed = records.find((record) => record.path === target);
  assert.ok(crashed);
  crashed.child.exitCode = 9; crashed.child.emit("exit", 9, null);
  await assert.rejects(manager.events("one", root, opened[7].leaseId, 0), /exited/);
  await manager.dispose();
  assert.ok(records.every((entry) => entry.child.exitCode !== null || entry.child.signalCode !== null));
  await assert.rejects(manager.open("one", root, paths[0], "official-cli"), /stopped/);
});
