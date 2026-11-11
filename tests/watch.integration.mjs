import assert from "node:assert/strict";
import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { WatchManager } from "../server/watch.ts";
import { resolveExecutable, runOfficeCli } from "../server/officecli.ts";

test("official watch: cell/chart edits, resident save, disk reopen and format limits", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "paseo-watch-integration-"));
  const executable = await resolveExecutable();
  const manager = new WatchManager();
  const file = join(root, "中文 editable.xlsx"), other = join(root, "other.xlsx");
  const documents = [file, other];
  const environment = { noResident: process.env.OFFICECLI_NO_AUTO_RESIDENT, flush: process.env.OFFICECLI_RESIDENT_FLUSH };
  const cli = (...args) => runOfficeCli(executable, args);
  const get = async (path, selector) => JSON.parse(await cli("get", path, selector, "--json")).data.results[0] ?? {};
  const send = (leaseId, body) => manager.request("test-workspace", root, leaseId, { route: "/api/send", method: "POST", body });
  try {
    process.env.OFFICECLI_NO_AUTO_RESIDENT = "1";
    process.env.OFFICECLI_RESIDENT_FLUSH = "off";
    await cli("create", file);
    await cli("set", file, "/Sheet1/A1", "--prop", "text=Before edit");
    await cli("add", file, "/Sheet1", "--type", "chart", "--prop", "type=column", "--prop", "title=Drag me", "--prop", "categories=Q1,Q2", "--prop", "data=Revenue:12,30", "--prop", "anchor=D4:J18");
    await cli("create", other);
    delete process.env.OFFICECLI_NO_AUTO_RESIDENT;
    await cli("open", file); // Test-owned resident with autosave disabled: save must be real, not inferred.
    const original = await readFile(file);
    const opened = await manager.open("test-workspace", root, file, executable);
    const anotherTab = await manager.open("test-workspace", root, file, executable);
    const otherFile = await manager.open("test-workspace", root, other, executable);
    await assert.rejects(manager.prepareSelection("test-workspace", root, opened.leaseId, ["/Sheet1/A1"]), /"code":"selectionFormats"/);
    assert.match(opened.html, /dblclick/); assert.match(opened.html, /\/api\/send/);
    assert.equal(opened.savedRevision, null);
    const edited = await send(opened.leaseId, { path: "/Sheet1/A1", prop: "text", value: "Paseo interactive 中文" });
    assert.equal(edited.lastWrite, "applied"); assert.equal(edited.savedRevision, null);
    await send(anotherTab.leaseId, { path: "/Sheet1/chart[1]", props: { x: "6", y: "7" } });
    assert.equal((await get(file, "/Sheet1/A1")).text, "Paseo interactive 中文");
    assert.equal((await get(file, "/Sheet1/chart[1]")).format.anchor, "G8:M22");
    assert.notEqual((await get(other, "/Sheet1/A1")).text, "Paseo interactive 中文", "another source file stays unchanged");
    assert.deepEqual(await readFile(file), original, "accepted in resident does not mean saved to disk");
    await assert.rejects(send(opened.leaseId, { path: "/missing/A1", prop: "text", value: "must fail visibly" }), /Sheet not found/);
    let updates;
    for (let attempt = 0; attempt < 30; attempt++) {
      updates = await manager.events("test-workspace", root, opened.leaseId, opened.cursor);
      if (updates.events.some((event) => event.data.includes("excel-"))) break;
      await delay(200);
    }
    assert.ok(updates.events.some((event) => event.type === "update" && event.data.includes("excel-")), "official SSE deltas arrive over the bridge");
    const saved = await manager.save("test-workspace", root, opened.leaseId);
    assert.equal(saved.savedRevision, saved.revision);
    assert.notDeepEqual(await readFile(file), original);
    const diskCopy = join(root, "disk-reopen.xlsx");
    await copyFile(file, diskCopy);
    process.env.OFFICECLI_NO_AUTO_RESIDENT = "1";
    assert.equal((await get(diskCopy, "/Sheet1/A1")).text, "Paseo interactive 中文", "read from a fresh path, not resident memory");
    assert.equal((await get(diskCopy, "/Sheet1/chart[1]")).format.anchor, "G8:M22");
    delete process.env.OFFICECLI_NO_AUTO_RESIDENT;
    await manager.close("test-workspace", opened.leaseId);
    assert.ok((await manager.request("test-workspace", root, anotherTab.leaseId, { route: "/", method: "GET" })).body.includes("Paseo interactive"));
    await manager.close("test-workspace", anotherTab.leaseId);
    await manager.close("test-workspace", otherFile.leaseId);
    for (const extension of ["docx", "pptx"]) {
      const path = join(root, `preview.${extension}`);
      documents.push(path);
      await copyFile(resolve(`examples/smoke.${extension}`), path);
      const before = await readFile(path);
      await cli("open", path);
      const page = await manager.open("test-workspace", root, path, executable);
      const secondTab = await manager.open("test-workspace", root, path, executable);
      assert.match(page.html, /data-path=/);
      const first = extension === "docx" ? "/body/p[1]" : "/slide[1]/shape[@id=100000]";
      const second = extension === "docx" ? "/body/p[2]" : "/slide[1]/shape[@id=100001]";
      const select = (leaseId, selected) => manager.request("test-workspace", root, leaseId, { route: "/api/selection", method: "POST", body: { paths: [selected] } });
      await select(page.leaseId, first);
      let updates;
      for (let attempt = 0; attempt < 30; attempt++) {
        updates = await manager.events("test-workspace", root, page.leaseId, page.cursor);
        if (updates.events.some((event) => event.type === "update" && event.data.includes("selection-update"))) break;
        await delay(200);
      }
      assert.ok(updates.events.some((event) => event.type === "update" && event.data.includes("selection-update")), "selection SSE reaches the client");
      await select(secondTab.leaseId, second);
      const captured = await manager.prepareSelection("test-workspace", root, page.leaseId, [first]);
      assert.match(captured.preview, extension === "docx" ? /Word preview/ : /Paseo OfficeCLI/);
      const attachment = manager.searchSelection(captured.token).items[0];
      assert.match(attachment.text, extension === "docx" ? /paraId=00100000/ : /shape\[@id=100000\]/);
      assert.doesNotMatch(attachment.text, extension === "docx" ? /official OfficeCLI renderer/ : /PowerPoint preview inside Paseo/);
      assert.equal(manager.searchSelection("").items[0].text, captured.preview);
      assert.deepEqual(await readFile(path), before, "capturing a selection does not write the document");
      await assert.rejects(manager.prepareSelection("other-workspace", root, page.leaseId, [first]), /"code":"watchExpired"/);
      await assert.rejects(manager.prepareSelection("test-workspace", root, page.leaseId, ["/missing"]));
      await cli("set", path, first, "--prop", "text=Changed after capture", "--json");
      assert.equal(manager.searchSelection(captured.token).items[0].text, attachment.text, "later edits do not change the snapshot");
      const residentSnapshot = await manager.prepareSelection("test-workspace", root, page.leaseId, [first]);
      assert.match(residentSnapshot.preview, /Changed after capture/, "capture reads the current resident, not an old disk copy");
      assert.deepEqual(await readFile(path), before, "resident changes are not confused with saved disk state");
      await manager.close("test-workspace", page.leaseId);
      await manager.close("test-workspace", secondTab.leaseId);
    }
    await manager.dispose();
    assert.match(await cli("open", file), /already|running|resident/i, "disposing watch does not close the resident");
  } finally {
    await manager.dispose();
    for (const path of documents) await cli("close", path).catch(() => {}); // Only documents this test created.
    for (const [key, value] of [["OFFICECLI_NO_AUTO_RESIDENT", environment.noResident], ["OFFICECLI_RESIDENT_FLUSH", environment.flush]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
