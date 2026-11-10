import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { MAX_OUTPUT_BYTES, resolveDocument, resolveExecutable, runOfficeCli } from "../server/officecli.ts";

const temp = await mkdtemp(join(tmpdir(), "paseo-officecli-"));
after(() => rm(temp, { recursive: true, force: true }));
const root = join(temp, "workspace");
await mkdir(root);
const document = join(root, "中文 file.DOCX");
await writeFile(document, "fixture");

test("valid document with spaces, Unicode and uppercase extension", async () => {
  assert.equal((await resolveDocument(root, document)).toLowerCase(), document.toLowerCase());
});

test("rejects outside paths, sibling prefixes, relative paths and NUL", async () => {
  const sibling = join(temp, "workspace-other");
  await mkdir(sibling);
  const outside = join(sibling, "secret.docx");
  await writeFile(outside, "secret");
  await assert.rejects(resolveDocument(root, outside), /inside the selected workspace/);
  await assert.rejects(resolveDocument(root, "relative.docx"), /absolute/);
  await assert.rejects(resolveDocument(root, document + "\0"), /absolute/);
});

test("rejects symlink/junction escape", async () => {
  const outside = join(temp, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "secret.docx"), "secret");
  await symlink(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(resolveDocument(root, join(root, "linked", "secret.docx")), /inside the selected workspace/);
});

test("rejects missing files, unsupported formats, directories and workspace itself", async () => {
  const text = join(root, "notes.txt");
  const directory = join(root, "folder.docx");
  await writeFile(text, "text");
  await mkdir(directory);
  await assert.rejects(resolveDocument(root, join(root, "missing.docx")), /ENOENT/);
  await assert.rejects(resolveDocument(root, text), /Supported documents/);
  await assert.rejects(resolveDocument(root, directory), /regular file/);
  await assert.rejects(resolveDocument(root, root), /inside the selected workspace/);
});

test("explicit executable takes priority; invalid configuration does not silently fall back", async () => {
  assert.equal(await resolveExecutable(process.execPath, { OFFICECLI_PATH: "invalid" }), process.execPath);
  assert.equal(await resolveExecutable("", { OFFICECLI_PATH: process.execPath }), process.execPath);
  await assert.rejects(resolveExecutable("relative"), /absolute/);
  await assert.rejects(resolveExecutable(join(temp, "missing")), /ENOENT/);
});

test("discovers PATH installations afresh after changes", async () => {
  const bin = join(temp, "bin with spaces");
  await mkdir(bin);
  const binary = join(bin, process.platform === "win32" ? "officecli.exe" : "officecli");
  await writeFile(binary, "fixture", { mode: 0o700 });
  assert.equal(await resolveExecutable("", { PATH: bin }), binary);
  await rm(binary);
  const fallback = await resolveExecutable("", { PATH: bin }).catch(() => null);
  assert.notEqual(fallback, binary);
});

test("passes paths and shell metacharacters literally, never through a shell", async () => {
  const args = [document, "; echo INJECTION", "$(whoami)", "a\"b"];
  const output = await runOfficeCli(process.execPath, ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--", ...args]);
  assert.deepEqual(JSON.parse(output), args);
});

test("reports command errors and bounds output", async () => {
  await assert.rejects(runOfficeCli(process.execPath, ["-e", "console.error('bad document');process.exit(2)"]), /bad document/);
  await assert.rejects(runOfficeCli(process.execPath, ["-e", `process.stdout.write('x'.repeat(${MAX_OUTPUT_BYTES + 1}))`]), /16 MiB/);
});
