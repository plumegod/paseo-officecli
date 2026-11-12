import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("paseo-plugin.json", root), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, "pack", "--dry-run", "--ignore-scripts", "--json"], { cwd: fileURLToPath(root), encoding: "utf8" }));
const files = new Set(packed.files.map(({ path }) => path));

test("release artifact includes every local import and only host-provided runtime libraries", () => {
  for (const file of ["paseo-plugin.json", "index.client.tsx", "index.server.ts", "LICENSE", "OVERVIEW.md", "OVERVIEW.zh-CN.md"]) assert.ok(files.has(file), file);
  assert.deepEqual(pkg.dependencies ?? {}, {}, "New runtime dependencies need a locked installation path");
  assert.equal(manifest.build, undefined, "Host-only plugins must not install development dependencies on users' machines");
  const host = new Set(["@getpaseo/plugin", "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui", "@getpaseo/plugin/server", "react", "react/jsx-runtime", "react-native", "@tanstack/react-query", "zod"]);
  for (const file of files) {
    assert.doesNotMatch(file, /^(?:node_modules|tests|examples|artifacts|\.git)\//);
    if (!/\.tsx?$/.test(file)) continue;
    const source = ts.createSourceFile(file, readFileSync(new URL(file, root), "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      const name = node.moduleSpecifier.text;
      if (name.startsWith(".")) {
        const target = posix.normalize(posix.join(posix.dirname(file), name));
        assert.ok([target, target + ".ts", target + ".tsx"].some((path) => files.has(path)), `${file}: missing ${name} in package`);
      } else {
        assert.ok(host.has(name) || file.startsWith("server/") && name.startsWith("node:") || file === "index.server.ts" && name.startsWith("node:"), `${file}: unsupported runtime import ${name}`);
      }
    }
  }
});

test("listing includes an English overview, description and shipped interface image", () => {
  assert.ok(manifest.description?.trim());
  assert.ok(manifest.media?.length > 0);
  for (const path of manifest.media) {
    assert.ok(files.has(path), `Missing listing media: ${path}`);
    assert.match(path, /\.(png|jpe?g|webp|gif)$/i);
  }
  for (const path of ["OVERVIEW.md", "OVERVIEW.zh-CN.md"]) {
    const overview = readFileSync(new URL(path, root), "utf8");
    assert.doesNotMatch(overview, /\bpaseo plugin add\b|\bnpm (?:install|i)\b/i);
    assert.ok(overview.includes(manifest.requirements.paseo.replace(/^>=/, "")));
  }
});
