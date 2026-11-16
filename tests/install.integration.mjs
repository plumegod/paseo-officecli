import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);
const project = fileURLToPath(new URL("../", import.meta.url));

// Only the npm transport is a fixture; compilation and activation use the official daemon.
test("official npm acquisition installs, reloads, checks updates and removes the packed plugin without Git", { timeout: 240_000 }, async () => {
  assert.ok(process.env.PASEO_CLI_ENTRYPOINT, "Set PASEO_CLI_ENTRYPOINT to an installed @getpaseo/cli/dist/index.js");
  const root = await mkdtemp(join(tmpdir(), "paseo-officecli-install-"));
  const home = join(root, "daemon"), bin = join(root, "bin"), gitLog = join(root, "git-called");
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  // Windows cannot exec a .cmd shim directly, so also remove real Git executables from PATH.
  const paths = (env[pathKey] ?? "").split(delimiter).filter((path) => process.platform !== "win32" || !existsSync(join(path, "git.exe")));
  env[pathKey] = [bin, ...paths].join(delimiter);
  for (const key of Object.keys(env)) if (/^npm_config_(registry|cache)$/i.test(key)) delete env[key];
  env.npm_config_cache = join(root, "npm-cache");
  const cli = async (...args) => {
    const { stdout } = await execute(process.env.PASEO_CLI_EXECUTABLE || process.execPath, [process.env.PASEO_CLI_ENTRYPOINT, "--home", home, ...args], { env, timeout: 90_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  };
  let started = false, registry;
  const requests = [];
  try {
    await mkdir(home); await mkdir(bin);
    await writeFile(join(bin, process.platform === "win32" ? "git.cmd" : "git"), process.platform === "win32"
      ? `@echo off\necho called>"${gitLog}"\nexit /b 97\n`
      : `#!/bin/sh\nprintf called > '${gitLog}'\nexit 97\n`, { mode: 0o755 });
    await assert.rejects(execute("git", ["--version"], { env }), "Git must not be usable in this test");
    await rm(gitLog, { force: true });
    const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    const { stdout } = await execute(process.execPath, [process.env.npm_execpath, "pack", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: project });
    const [packed] = JSON.parse(stdout);
    const tarball = await readFile(join(root, packed.filename));
    registry = createHttpServer((request, response) => {
      requests.push(request.url);
      if (request.url === `/${packed.filename}`) {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(tarball);
      } else if (request.url === `/${pkg.name}`) {
        const url = `http://127.0.0.1:${registry.address().port}`;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ name: pkg.name, "dist-tags": { latest: pkg.version }, versions: {
          [pkg.version]: { ...pkg, dist: { tarball: `${url}/${packed.filename}`, integrity: packed.integrity, shasum: packed.shasum } },
        } }));
      } else {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Not found" }));
      }
    });
    await new Promise((resolve, reject) => { registry.once("error", reject); registry.listen(0, "127.0.0.1", resolve); });
    env.npm_config_registry = `http://127.0.0.1:${registry.address().port}`;
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close((error) => error ? reject(error) : resolve(port)); });
    });
    await writeFile(join(home, "config.json"), JSON.stringify({ version: 1, daemon: { listen: `127.0.0.1:${port}`, relay: { enabled: false }, mcp: { enabled: false } }, pluginsEnabled: true }));
    started = true;
    await cli("daemon", "start", "--timeout", "60");
    const installed = JSON.parse(await cli("plugin", "add", `npm:${pkg.name}@${pkg.version}`, "--json"));
    assert.equal(installed.id, "paseo-officecli");
    assert.equal(installed.status, "running");
    assert.equal(installed.installation.identity.kind, "npm");
    assert.equal(installed.installation.identity.packageName, pkg.name);
    assert.equal(installed.installation.currentRevision, pkg.version);
    await assert.rejects(access(join(installed.path, "node_modules")), { code: "ENOENT" });
    await access(join(installed.path, "paseo-plugin.json"));
    await cli("plugin", "reload", installed.id, "--json");
    const [reloaded] = JSON.parse(await cli("plugin", "ls", "--json"));
    assert.equal(reloaded.status, "running");
    assert.equal(reloaded.installation.identity.kind, "npm");
    await cli("plugin", "update", installed.id, "--check", "--json");
    const logs = JSON.parse(await cli("plugin", "logs", installed.id, "--json"));
    assert.ok(logs.some(({ message }) => message.includes("Plugin ready")));
    await cli("plugin", "remove", installed.id, "--json");
    assert.deepEqual(JSON.parse(await cli("plugin", "ls", "--json")), []);
    await assert.rejects(access(installed.path), { code: "ENOENT" });
    assert.ok(requests.includes(`/${pkg.name}`), "The daemon must resolve npm metadata");
    assert.ok(requests.includes(`/${packed.filename}`), "The daemon must download the packed artifact");
    assert.equal(existsSync(gitLog), false, "Plugin acquisition and lifecycle must never invoke Git");
  } finally {
    try {
      if (started) await cli("daemon", "stop");
    } finally {
      if (registry?.listening) await new Promise((resolve) => registry.close(resolve));
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
});
