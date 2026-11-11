import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assetUrl, expectedChecksum, release, selectVersions, verifyChecksum, verifyVersion } from "../.github/scripts/officecli-regression.mjs";

const stable = (tag_name) => ({ tag_name, draft: false, prerelease: false });

test("regression matrix contains only the baseline and distinct latest stable release", () => {
  assert.deepEqual(selectVersions(stable("v1.0.160")), ["v1.0.160"]);
  assert.deepEqual(selectVersions(stable("1.0.160")), ["v1.0.160"]);
  assert.deepEqual(selectVersions(stable("v1.0.161")), ["v1.0.160", "v1.0.161"]);
  assert.deepEqual(selectVersions(stable("v2.0.0")), ["v1.0.160", "v2.0.0"]);
  assert.throws(() => selectVersions(stable("v1.0.159")), /below.*baseline/);
  assert.throws(() => selectVersions(stable("v1.0.160-rc1")), /Invalid stable release tag/);
  assert.throws(() => selectVersions({ ...stable("v1.0.161"), prerelease: true }), /not a published stable release/);
  assert.throws(() => selectVersions({ ...stable("v1.0.161"), draft: true }), /not a published stable release/);
});

test("release API errors are failures, not an empty or fallback matrix", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("rate limited", { status: 403 }));
  await assert.rejects(release("latest"), /Download failed: .*releases\/latest \(HTTP 403\)/);
});

test("official asset, checksum and actual version must match", () => {
  const contents = Buffer.from("test executable");
  const checksum = createHash("sha256").update(contents).digest("hex");
  const asset = { name: "officecli-win-x64.exe", browser_download_url: "https://example.test/officecli-win-x64.exe" };
  assert.equal(assetUrl({ assets: [asset] }, asset.name), asset.browser_download_url);
  assert.throws(() => assetUrl({ tag_name: "v1.0.160", assets: [] }, asset.name), /missing a unique/);
  assert.throws(() => assetUrl({ assets: [asset, asset] }, asset.name), /missing a unique/);
  const manifest = `${checksum}  ${asset.name}\r\n`;
  assert.equal(expectedChecksum(manifest), checksum);
  assert.throws(() => expectedChecksum("bad checksum"), /exactly one valid/);
  assert.throws(() => expectedChecksum(manifest + manifest), /exactly one valid/);
  verifyChecksum(contents, checksum);
  assert.throws(() => verifyChecksum(contents, "0".repeat(64)), /does not match/);
  verifyVersion("v1.0.160", "1.0.160\r\n");
  assert.throws(() => verifyVersion("v1.0.160", "1.0.159"), /version mismatch/);
});
