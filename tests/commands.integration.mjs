import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CommandRunner, resolveExecutable } from "../server/officecli.ts";

// Test-owned documents only; do not start or close the user's document residents.
process.env.OFFICECLI_NO_AUTO_RESIDENT = "1";
const executable = await resolveExecutable();

async function waitFor(runner, predicate = (job) => job.status !== "running", timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const job = runner.get("integration");
    if (job && predicate(job)) return job;
    await delay(30);
  }
  throw new Error("Official command did not reach the expected state.");
}

async function setup(t) {
  const cwd = await mkdtemp(join(tmpdir(), "paseo-officecli-commands-"));
  const runner = new CommandRunner();
  t.after(async () => { runner.dispose(); await rm(cwd, { recursive: true, force: true }); });
  async function command(args, input = "", success = true) {
    runner.start("integration", cwd, executable, args, input, false);
    const job = await waitFor(runner);
    assert.equal(job.exitCode === 0, success, `${JSON.stringify(args)}\n${job.stdout}\n${job.stderr}\n${job.error || ""}`);
    assert.equal(job.status, success ? "completed" : "failed");
    return job;
  }
  return { cwd, runner, command };
}

test("unified runner uses current official help, including the full structured schema", async (t) => {
  const { command } = await setup(t);
  assert.match((await command(["--version"])).stdout, /\d+\.\d+\.\d+/);
  const help = await command(["help", "all", "--json"]);
  JSON.parse(help.stdout);
  for (const verb of ["create", "get", "query", "set", "add", "remove", "move", "batch", "dump"]) assert.ok(help.stdout.includes(verb), `Official schema includes ${verb}`);
  assert.match((await command(["help"])).stdout, /mcp/);
  assert.match((await command(["help", "xlsx", "cell"])).stdout, /formula/);
});

test("Word create, text/JSON reads, style edits, analysis, clone, move, remove and cross-document replay", async (t) => {
  const { cwd, command } = await setup(t);
  const file = "中文 document with spaces.docx";
  await command(["create", file]);
  await command(["add", file, "/body", "--type", "paragraph", "--prop", "text=Original heading", "--prop", "style=Heading1"]);
  await command(["add", file, "/body", "--type", "paragraph", "--prop", "text=Second paragraph"]);
  await command(["set", file, "/body/p[1]", "--prop", "text=Updated heading"]);
  await command(["set", file, "/body/p[1]/r[1]", "--prop", "font=Calibri", "--prop", "size=18", "--prop", "color=1E2761"]);
  const structure = await command(["get", file, "/", "--depth", "3", "--json"]);
  assert.equal(JSON.parse(structure.stdout).data.results[0].type, "document");
  assert.match((await command(["get", file, "/body/p[1]/r[1]", "--json"])).stdout, /Calibri/);
  assert.match((await command(["query", file, "paragraph[style=Heading1]", "--json"])).stdout, /Updated heading/);
  await command(["add", file, "/body", "--from", "/body/p[1]"]);
  await command(["move", file, "/body/p[3]", "--index", "0"]);
  await command(["remove", file, "/body/p[2]"]);
  const text = (await command(["view", file, "text"])).stdout;
  assert.match(text, /Updated heading/);
  assert.match(text, /Second paragraph/);
  JSON.parse((await command(["view", file, "issues", "--json"])).stdout);
  await command(["validate", file]);
  await command(["save", file]);
  const before = await readFile(join(cwd, file));
  await command(["create", file], "", false);
  assert.deepEqual(await readFile(join(cwd, file)), before, "no implicit --force or overwrite");
  const dump = (await command(["dump", file, "/body"])).stdout;
  assert.ok(Array.isArray(JSON.parse(dump)));
  await command(["create", "copy.docx"]);
  await command(["batch", "copy.docx"], dump);
  assert.match((await command(["view", "copy.docx", "text"])).stdout, /Updated heading[\s\S]*Second paragraph/);
});

test("Excel values, formulas, style and stdin batch are passed unchanged; failed atomic batch does not write", async (t) => {
  const { cwd, command } = await setup(t);
  const file = "formulas.xlsx";
  await command(["create", file]);
  await command(["batch", file], JSON.stringify([
    { command: "set", path: "/Sheet1/A1", props: { value: "12", bold: "true", "font.color": "1E2761" } },
    { command: "set", path: "/Sheet1/B1", props: { value: "30" } },
    { command: "set", path: "/Sheet1/C1", props: { formula: "SUM(A1:B1)", numFmt: "0.00" } },
  ]));
  const formula = await command(["get", file, "/Sheet1/C1", "--json"]);
  JSON.parse(formula.stdout);
  assert.match(formula.stdout, /SUM\(A1:B1\)/);
  assert.match((await command(["query", file, "cell:has(formula)", "--json"])).stdout, /C1/);
  JSON.parse((await command(["view", file, "issues", "--json"])).stdout);
  await command(["save", file]);
  const before = await readFile(join(cwd, file));
  await command(["batch", file], JSON.stringify([
    { command: "set", path: "/Sheet1/A1", props: { value: "999" } },
    { command: "not-an-official-command" },
  ]), false);
  assert.deepEqual(await readFile(join(cwd, file)), before);
  assert.match((await command(["get", file, "/Sheet1/A1", "--json"])).stdout, /12/);
});

test("PowerPoint text, font, color, layout, pictures, charts and slide reordering use official commands", async (t) => {
  const { cwd, command } = await setup(t);
  const file = "editable.pptx";
  await writeFile(join(cwd, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7YbZsAAAAASUVORK5CYII=", "base64"));
  await command(["create", file]);
  await command(["add", file, "/", "--type", "slide", "--prop", "layout=blank", "--prop", "background=1E2761"]);
  await command(["add", file, "/slide[1]", "--type", "shape", "--prop", "name=Editable", "--prop", "text=Original title", "--prop", "x=2cm", "--prop", "y=1cm", "--prop", "width=20cm", "--prop", "height=2cm", "--prop", "size=28", "--prop", "color=FFFFFF"]);
  await command(["set", file, "/slide[1]/shape[@name=Editable]", "--prop", "text=Updated title", "--prop", "font=Calibri", "--prop", "x=3cm"]);
  await command(["add", file, "/slide[1]", "--type", "picture", "--prop", "src=pixel.png", "--prop", "alt=Integration pixel", "--prop", "x=2cm", "--prop", "y=5cm", "--prop", "width=1cm", "--prop", "height=1cm"]);
  await command(["add", file, "/slide[1]", "--type", "chart", "--prop", "chartType=column", "--prop", "categories=Q1,Q2", "--prop", "data=Revenue:12,30", "--prop", "x=5cm", "--prop", "y=5cm", "--prop", "width=15cm", "--prop", "height=8cm"]);
  assert.match((await command(["query", file, "shape", "--json"])).stdout, /Updated title/);
  assert.match((await command(["query", file, "picture", "--json"])).stdout, /Integration pixel/);
  assert.match((await command(["query", file, "chart", "--json"])).stdout, /Revenue/);
  await command(["add", file, "/", "--type", "slide", "--prop", "layout=blank"]);
  await command(["move", file, "/slide[2]", "--index", "0"]);
  await command(["remove", file, "/slide[1]"]);
  assert.match((await command(["view", file, "text"])).stdout, /Updated title/);
  await command(["save", file]);
});

test("official MCP stdio stays interactive beyond the old 60-second preview timeout and can be stopped", { timeout: 80_000 }, async (t) => {
  const { cwd, runner } = await setup(t);
  const job = runner.start("integration", cwd, executable, ["mcp"], "", true);
  runner.input("integration", job.id, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "paseo-officecli-test", version: "0.2.0" } } }) + "\n", false);
  await waitFor(runner, (state) => state.stdout.includes('"id":1'));
  runner.input("integration", job.id, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n" + JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n", false);
  const response = await waitFor(runner, (state) => state.stdout.includes('"id":2'));
  const tools = response.stdout.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line)).find((message) => message.id === 2);
  assert.ok(tools.result.tools.length > 0);
  await delay(61_000);
  assert.equal(runner.get("integration").status, "running");
  assert.equal(runner.get("integration").stdinOpen, true);
  runner.stop("integration", job.id);
  assert.equal((await waitFor(runner)).status, "stopped");
});
