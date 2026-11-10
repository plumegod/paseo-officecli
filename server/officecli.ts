import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, extname, isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export async function resolveExecutable(configured = "", env = process.env): Promise<string> {
  const explicit = configured.trim() || env.OFFICECLI_PATH?.trim();
  if (explicit) {
    if (!isAbsolute(explicit) || explicit.includes("\0")) throw new Error("OfficeCLI path must be absolute, without surrounding quotes.");
    await access(explicit, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return explicit;
  }
  const name = process.platform === "win32" ? "officecli.exe" : "officecli";
  const installed = process.platform === "win32"
    ? join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "OfficeCLI", name)
    : join(homedir(), ".local", "bin", name);
  for (const candidate of [...(env.PATH || "").split(delimiter).filter(isAbsolute).map((directory) => join(directory, name)), installed]) {
    try {
      await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
    }
  }
  throw new Error("OfficeCLI not found. Install the official CLI or set its absolute path in Settings → OfficeCLI.");
}

export async function runOfficeCli(executable: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execute(executable, args, {
      encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: MAX_OUTPUT_BYTES,
    });
    return stdout;
  } catch (error) {
    const failure = error as Error & { stderr?: string; killed?: boolean; code?: string | number };
    if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("OfficeCLI preview exceeds the 16 MiB output limit.");
    if (failure.killed) throw new Error("OfficeCLI timed out after 60 seconds.");
    throw new Error(`OfficeCLI failed: ${(failure.stderr || failure.message).trim().slice(0, 2000)}`);
  }
}

export async function resolveDocument(root: string, path: string): Promise<string> {
  if (!isAbsolute(path) || path.includes("\0")) throw new Error("Expected an absolute document path.");
  const [realRoot, target] = await Promise.all([realpath(root), realpath(path)]);
  const inside = relative(realRoot, target);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error("Document must be inside the selected workspace.");
  }
  if (![".docx", ".xlsx", ".pptx"].includes(extname(target).toLowerCase())) throw new Error("Supported documents: .docx, .xlsx, .pptx.");
  if (!(await stat(target)).isFile()) throw new Error("Document is not a regular file.");
  return target;
}

export async function renderDocument(executable: string, path: string): Promise<string> {
  const html = await runOfficeCli(executable, ["view", path, "html"]);
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error("OfficeCLI did not return an HTML document. Check the official CLI's view command.");
  return html;
}
