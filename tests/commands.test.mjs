import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CommandRunner, MAX_OUTPUT_BYTES } from "../server/officecli.ts";
import { MAX_INPUT_CHARS, parseArguments } from "../shared/commands.ts";

async function until(runner, workspace, predicate = (job) => job.status !== "running") {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const job = runner.get(workspace);
    if (job && predicate(job)) return job;
    await delay(20);
  }
  throw new Error("Command did not reach the expected state.");
}

function runnerFor(t) {
  const runner = new CommandRunner();
  t.after(() => runner.dispose());
  return runner;
}

const node = (runner, cwd, script, args = [], input = "", keepOpen = false, workspace = "w") =>
  runner.start(workspace, cwd, process.execPath, ["-e", script, "--", ...args], input, keepOpen);

test("argv is an exact JSON string array, never shell syntax", () => {
  assert.deepEqual(parseArguments('["set","中文 space.docx","; echo bad","$(whoami)",""]'), ["set", "中文 space.docx", "; echo bad", "$(whoami)", ""]);
  for (const input of ['help', '{}', '[]', '[1]', '[""]', '["a\\u0000b"]', ' '.repeat(MAX_INPUT_CHARS + 1)]) assert.throws(() => parseArguments(input));
  assert.deepEqual(parseArguments('["future-official-command","--future-option"]'), ["future-official-command", "--future-option"]);
});

test("runner preserves argv, cwd, stdin, stdout, stderr and exit code", async (t) => {
  const runner = runnerFor(t);
  const cwd = await mkdtemp(join(tmpdir(), "paseo-command-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const args = ["中文 with spaces", "; echo injected", 'a"b', "$(whoami)"];
  node(runner, cwd, 'let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",s=>input+=s);process.stdin.on("end",()=>{console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1),input}));console.error("diagnostic");});', args, "批处理\n{}\n");
  const job = await until(runner, "w");
  assert.equal(job.status, "completed");
  assert.equal(job.exitCode, 0);
  assert.equal(job.stdinOpen, false);
  assert.deepEqual(JSON.parse(job.stdout), { cwd, args, input: "批处理\n{}\n" });
  assert.match(job.stderr, /diagnostic/);
});

test("non-zero exit and spawn failures remain inspectable", async (t) => {
  const runner = runnerFor(t);
  node(runner, process.cwd(), 'console.error("expected CLI failure");process.exitCode=7;');
  const job = await until(runner, "w");
  assert.equal(job.status, "failed");
  assert.equal(job.exitCode, 7);
  assert.match(job.stderr, /expected CLI failure/);
  runner.start("w", process.cwd(), join(process.cwd(), "missing-officecli-executable"), ["help"], "", false);
  const failed = await until(runner, "w");
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /ENOENT/);
});

test("streaming stdin and explicit EOF work without a fixed timeout", async (t) => {
  const runner = runnerFor(t);
  const job = node(runner, process.cwd(), 'process.stdin.setEncoding("utf8");process.stdin.on("data",s=>process.stdout.write(s));process.stdin.on("end",()=>process.stdout.write("EOF"));', [], "first\n", true);
  await until(runner, "w", (job) => job.stdout.includes("first"));
  assert.throws(() => runner.input("w", job.id, "x".repeat(4 * 1024 * 1024 + 1), false), /"code":"stdinBusy"/);
  runner.input("w", job.id, "second\n", false);
  runner.input("w", job.id, "last\n", true);
  const done = await until(runner, "w");
  assert.equal(done.stdout, "first\nsecond\nlast\nEOF");
  assert.equal(done.status, "completed");
  assert.throws(() => runner.input("w", job.id, "late", false), /"code":"stdinClosed"/);
});

test("active jobs cannot be overwritten and stop checks workspace plus job identity", async (t) => {
  const runner = runnerFor(t);
  const job = node(runner, process.cwd(), 'setInterval(()=>{},1000);');
  assert.throws(() => node(runner, process.cwd(), 'console.log("replacement");'), /"code":"commandRunning"/);
  assert.throws(() => runner.stop("another-workspace", job.id), /"code":"commandMissing"/);
  assert.throws(() => runner.stop("w", "stale-id"), /"code":"commandMissing"/);
  runner.stop("w", job.id);
  assert.equal((await until(runner, "w")).status, "stopped");
  const replacement = node(runner, process.cwd(), 'console.log("new");');
  assert.notEqual(replacement.id, job.id);
  assert.throws(() => runner.input("w", job.id, "", true), /"code":"commandMissing"/);
  assert.equal((await until(runner, "w")).status, "completed");
});

test("output is bounded and an overflowing process is stopped without claiming rollback", async (t) => {
  const runner = runnerFor(t);
  node(runner, process.cwd(), `process.stdout.write("x".repeat(${MAX_OUTPUT_BYTES + 65536}));setInterval(()=>{},1000);`);
  const job = await until(runner, "w");
  assert.equal(job.status, "failed");
  assert.match(job.error, /"code":"outputLimit"/);
  assert.equal(Buffer.byteLength(job.stdout) + Buffer.byteLength(job.stderr), MAX_OUTPUT_BYTES);
});

test("retention is bounded, evicts finished jobs and never evicts an active process", async (t) => {
  const runner = runnerFor(t);
  for (let i = 0; i < 8; i++) node(runner, process.cwd(), 'setInterval(()=>{},1000);', [], "", false, `w${i}`);
  assert.throws(() => node(runner, process.cwd(), 'console.log("ninth");', [], "", false, "w8"), /"code":"workspaceLimit"/);
  const oldest = runner.get("w0");
  runner.stop("w0", oldest.id);
  await until(runner, "w0");
  node(runner, process.cwd(), 'console.log("replacement workspace");', [], "", false, "w8");
  await until(runner, "w8");
  assert.equal(runner.get("w0"), null);
  assert.equal(runner.get("w1").status, "running");
  runner.dispose();
  assert.equal(runner.get("w1"), null);
});
