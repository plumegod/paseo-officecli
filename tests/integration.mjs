import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { renderDocument, resolveExecutable, runOfficeCli } from "../server/officecli.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = await resolveExecutable();
console.log(`Official OfficeCLI: ${(await runOfficeCli(executable, ["--version"])).trim()}`);
const temp = await mkdtemp(join(tmpdir(), "paseo-officecli-live-"));
after(() => rm(temp, { recursive: true, force: true }));
for (const format of ["docx", "xlsx", "pptx"]) {
  test(`official ${format} renderer opens the sample without modifying it`, async () => {
    const file = join(temp, `smoke.${format}`);
    await copyFile(join(root, "examples", `smoke.${format}`), file);
    const before = await readFile(file);
    const html = await renderDocument(executable, file);
    assert.match(html, /<html[\s>]/i);
    assert.match(html, /Paseo OfficeCLI/);
    assert.deepEqual(await readFile(file), before);
  });
}
test("corrupt Office file gives a visible error instead of fake HTML", async () => {
  const file = join(temp, "broken.docx");
  await writeFile(file, "not an Office ZIP");
  await assert.rejects(renderDocument(executable, file), /OfficeCLI failed/);
});
