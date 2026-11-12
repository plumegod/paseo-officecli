import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const names = ["README.md", "README.zh-CN.md", "README.ja.md"];
const readmes = names.map((name) => readFileSync(new URL(name, root), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("paseo-plugin.json", root), "utf8"));
const anchors = (text) => [...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((match) => match[1]);
const links = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]).sort();
const examples = (text) => [...text.matchAll(/^ *```([^\n]*)\n([\s\S]*?)^ *```/gm)]
  .map((match) => `${match[1]}\n${match[2].trim()}`);
const versions = (text) => [...text.matchAll(/\b\d+\.\d+(?:\.\d+)?(?:-beta\.\d+)?\b/g)]
  .map((match) => match[0]).sort();

function assertAligned(baseline, translated) {
  assert.deepEqual(anchors(translated), anchors(baseline), "README section anchors must match");
  assert.deepEqual(links(translated), links(baseline), "README links must match");
  assert.deepEqual(examples(translated), examples(baseline), "README command examples must match");
  assert.deepEqual(versions(translated), versions(baseline), "README versions must match");
}

test("English README and both translations share structure, links, commands and versions", () => {
  assert.deepEqual(anchors(readmes[0]), [
    "features", "requirements", "installation", "usage", "language", "safety", "development", "license",
  ]);
  assert.ok(examples(readmes[0]).length > 0);
  for (const text of readmes) {
    assertAligned(readmes[0], text);
    assert.ok(text.includes(manifest.requirements.paseo.replace(/^>=/, "")));
    for (const name of names) assert.ok(links(text).includes(name), `Missing language switch: ${name}`);
    assert.equal((text.match(/^## /gm) || []).length, anchors(text).length);
    assert.equal((text.match(/^### /gm) || []).length, (readmes[0].match(/^### /gm) || []).length);
  }
});

test("README local links resolve, including shared section anchors", () => {
  for (const text of readmes) {
    for (const link of links(text)) {
      if (/^https?:\/\//.test(link)) continue;
      const [path, fragment] = link.split("#");
      const target = new URL(path || "README.md", root);
      assert.ok(existsSync(target), `Broken README link: ${link}`);
      if (fragment) {
        const content = readFileSync(target, "utf8");
        assert.ok(anchors(content).includes(fragment), `Missing explicit anchor: ${link}`);
      }
    }
  }
});

test("README alignment rejects missing sections and stale technical details", () => {
  const original = readmes[0];
  for (const changed of [
    original.replace('<a id="safety"></a>', ""),
    original.replace("docs/USAGE.md", "docs/MISSING.md"),
    original.replace('["help"]', '["obsolete-command"]'),
    original.replace("1.0.160", "1.0.100"),
  ]) assert.throws(() => assertAligned(original, changed), assert.AssertionError);
});
