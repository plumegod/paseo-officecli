import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);
const project = fileURLToPath(new URL("../", import.meta.url));

test("a packed plugin installs, reloads and removes on an isolated official daemon without node_modules", { timeout: 180_000 }, async () => {
  assert.ok(process.env.PASEO_CLI_ENTRYPOINT, "Set PASEO_CLI_ENTRYPOINT to an installed @getpaseo/cli/dist/index.js");
  const root = await mkdtemp(join(tmpdir(), "paseo-officecli-install-"));
  const home = join(root, "daemon"), source = join(root, "source");
  const cli = async (...args) => {
    const { stdout } = await execute(process.execPath, [process.env.PASEO_CLI_ENTRYPOINT, "--home", home, ...args], { timeout: 90_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  };
  let started = false;
  try {
    await mkdir(home); await mkdir(source);
    const { stdout } = await execute(process.execPath, [process.env.npm_execpath, "pack", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: project });
    const [{ filename }] = JSON.parse(stdout);
    await execute("tar", ["-xzf", join(root, filename), "-C", source]);
    const plugin = join(source, "package");
    await assert.rejects(access(join(plugin, "node_modules")), { code: "ENOENT" });
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close((error) => error ? reject(error) : resolve(port)); });
    });
    await writeFile(join(home, "config.json"), JSON.stringify({ version: 1, daemon: { listen: `127.0.0.1:${port}`, relay: { enabled: false }, mcp: { enabled: false } }, pluginsEnabled: true }));
    started = true;
    await cli("daemon", "start", "--timeout", "60");
    const installed = JSON.parse(await cli("plugin", "install", plugin, "--json"));
    assert.equal(installed.id, "paseo-officecli");
    assert.equal(installed.status, "running");
    await cli("plugin", "reload", installed.id, "--json");
    const [reloaded] = JSON.parse(await cli("plugin", "ls", "--json"));
    assert.equal(reloaded.status, "running");
    const logs = JSON.parse(await cli("plugin", "logs", installed.id, "--json"));
    assert.ok(logs.some(({ message }) => message.includes("Plugin ready")));
    await cli("plugin", "remove", installed.id, "--json");
    assert.deepEqual(JSON.parse(await cli("plugin", "ls", "--json")), []);
  } finally {
    if (started) await cli("daemon", "stop");
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
