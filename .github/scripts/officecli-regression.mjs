import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "iOfficeAI/OfficeCLI";
const baseline = "v1.0.160";
const executableName = "officecli-win-x64.exe";

function version(tag) {
  if (typeof tag !== "string" || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error(`Invalid stable release tag: ${tag}`);
  }
  return tag.replace(/^v/, "");
}

export function selectVersions(latest) {
  if (latest.draft !== false || latest.prerelease !== false) throw new Error("Latest release is not a published stable release.");
  const actual = version(latest.tag_name);
  const minimum = version(baseline);
  const actualParts = actual.split(".").map(BigInt);
  const minimumParts = minimum.split(".").map(BigInt);
  for (let i = 0; i < actualParts.length; i++) {
    if (actualParts[i] < minimumParts[i]) throw new Error(`Latest stable release ${latest.tag_name} is below the ${baseline} baseline.`);
    if (actualParts[i] > minimumParts[i]) break;
  }
  return actual === minimum ? [baseline] : [baseline, latest.tag_name];
}

export function assetUrl(release, name) {
  const assets = release.assets?.filter((asset) => asset.name === name) ?? [];
  if (assets.length !== 1 || typeof assets[0].browser_download_url !== "string") throw new Error(`Release ${release.tag_name} is missing a unique ${name} asset.`);
  return assets[0].browser_download_url;
}

export function expectedChecksum(manifest) {
  const matches = [...manifest.matchAll(/^([a-f\d]{64})[\t ]+\*?officecli-win-x64\.exe[\t ]*\r?$/gim)];
  if (matches.length !== 1) throw new Error(`SHA256SUMS must contain exactly one valid ${executableName} checksum.`);
  return matches[0][1].toLowerCase();
}

export function verifyChecksum(contents, expected) {
  const actual = createHash("sha256").update(contents).digest("hex");
  console.log(`SHA256 expected: ${expected}\nSHA256 actual:   ${actual}`);
  if (actual !== expected) throw new Error("OfficeCLI asset SHA256 does not match the official SHA256SUMS.");
}

export function verifyVersion(tag, output) {
  if (output.trim() !== version(tag)) throw new Error(`OfficeCLI version mismatch: expected ${version(tag)}, got ${JSON.stringify(output.trim())}.`);
}

async function download(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download failed: ${url} (HTTP ${response.status}).`);
  return response;
}

export async function release(endpoint) {
  const headers = { "User-Agent": "paseo-officecli-regression", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return (await download(`https://api.github.com/repos/${repository}/releases/${endpoint}`, headers)).json();
}

async function resolveMatrix() {
  const latest = await release("latest");
  const versions = selectVersions(latest);
  console.log(`Latest stable release: ${latest.tag_name} (${latest.html_url})`);
  console.log(`Regression releases: ${versions.join(", ")}`);
  await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: versions.map((tag) => ({ tag })) })}\n`);
}

async function install(tag) {
  version(tag);
  const info = await release(`tags/${encodeURIComponent(tag)}`);
  if (info.tag_name !== tag || info.draft !== false || info.prerelease !== false) throw new Error(`Release ${tag} is not the requested published stable release.`);
  const checksumUrl = assetUrl(info, "SHA256SUMS");
  const executableUrl = assetUrl(info, executableName);
  console.log(`Release: ${info.html_url}\nSHA256SUMS: ${checksumUrl}\nExecutable: ${executableUrl}`);
  const manifest = await (await download(checksumUrl)).text();
  await writeFile(join(process.env.OFFICECLI_RESULTS_DIR, "SHA256SUMS"), manifest);
  const expected = expectedChecksum(manifest);
  const contents = Buffer.from(await (await download(executableUrl)).arrayBuffer());
  verifyChecksum(contents, expected);
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP, "officecli-"));
  const executable = join(directory, "officecli.exe");
  await writeFile(executable, contents);
  const { GITHUB_TOKEN: _token, ...environment } = process.env;
  const result = spawnSync(executable, ["--version"], { cwd: directory, env: environment, encoding: "utf8", timeout: 30_000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`OfficeCLI --version failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  console.log(`Actual OfficeCLI version: ${result.stdout.trim()}`);
  verifyVersion(tag, result.stdout);
  await appendFile(process.env.GITHUB_ENV, `OFFICECLI_PATH=${executable}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "matrix") await resolveMatrix();
    else if (process.argv[2] === "install") await install(process.argv[3]);
    else throw new Error("Expected matrix or install <tag>.");
  } catch (error) {
    console.error(`OfficeCLI regression ${process.argv[2]} failed:`, error);
    process.exitCode = 1;
  }
}
