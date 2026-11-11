import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CommandSnapshot } from "../shared/commands";
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
    const failure = error as Error & { stdout?: string; stderr?: string; killed?: boolean; code?: string | number };
    if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("OfficeCLI preview exceeds the 16 MiB output limit.");
    if (failure.killed) throw new Error("OfficeCLI timed out after 60 seconds.");
    const output = [failure.stderr, failure.stdout].filter(Boolean).join("\n") || failure.message;
    throw new Error(`OfficeCLI failed (exit ${failure.code ?? "unknown"}): ${output.trim().slice(0, 2000)}`);
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

type Job = { child: ChildProcessWithoutNullStreams; state: CommandSnapshot; bytes: number; stopped: boolean };

export class CommandRunner {
  private jobs = new Map<string, Job>();

  get(workspaceId: string): CommandSnapshot | null {
    const job = this.jobs.get(workspaceId);
    return job ? { ...job.state, args: [...job.state.args] } : null;
  }

  start(workspaceId: string, cwd: string, executable: string, args: string[], input: string, keepStdinOpen: boolean): CommandSnapshot {
    if (this.jobs.get(workspaceId)?.state.status === "running") throw new Error("A command is already running in this workspace.");
    if (!this.jobs.has(workspaceId) && this.jobs.size >= 8) {
      const oldestFinished = [...this.jobs].find(([, job]) => job.state.status !== "running");
      if (!oldestFinished) throw new Error("Eight workspaces already have running commands. Stop one first.");
      this.jobs.delete(oldestFinished[0]);
    }
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, stdio: "pipe" });
    const job: Job = {
      child, bytes: 0, stopped: false,
      state: { id: randomUUID(), executable, cwd, args: [...args], status: "running", stdout: "", stderr: "", error: null, exitCode: null, signal: null, stdinOpen: keepStdinOpen },
    };
    this.jobs.set(workspaceId, job);
    const append = (stream: "stdout" | "stderr", text: string) => {
      const bytes = Buffer.from(text);
      const remaining = MAX_OUTPUT_BYTES - job.bytes;
      job.state[stream] += bytes.subarray(0, Math.max(0, remaining)).toString("utf8");
      job.bytes += Math.min(bytes.length, Math.max(0, remaining));
      if (bytes.length > remaining && !job.state.error) {
        job.state.error = "Output exceeds 16 MiB; command stopped. Already applied changes are not rolled back.";
        child.kill("SIGKILL");
      }
    };
    child.stdout.setEncoding("utf8").on("data", (text: string) => append("stdout", text));
    child.stderr.setEncoding("utf8").on("data", (text: string) => append("stderr", text));
    child.on("error", (error) => { job.state.error = error.message; job.state.status = "failed"; });
    child.stdin.on("error", (error) => { job.state.error = `stdin: ${error.message}`; });
    child.stdin.on("close", () => { job.state.stdinOpen = false; });
    child.on("close", (code, signal) => {
      job.state.exitCode = code;
      job.state.signal = signal;
      job.state.stdinOpen = false;
      job.state.status = job.stopped ? "stopped" : job.state.error || code !== 0 ? "failed" : "completed";
    });
    if (keepStdinOpen) { if (input) child.stdin.write(input); }
    else child.stdin.end(input);
    return this.get(workspaceId)!;
  }

  input(workspaceId: string, jobId: string, input: string, eof: boolean): CommandSnapshot {
    const job = this.current(workspaceId, jobId);
    if (job.state.status !== "running" || !job.state.stdinOpen || job.child.stdin.destroyed) throw new Error("The command's stdin is closed.");
    if (job.child.stdin.writableLength + Buffer.byteLength(input) > 4 * 1024 * 1024) throw new Error("stdin is busy. Wait for the command to consume the queued input.");
    if (eof) { job.state.stdinOpen = false; job.child.stdin.end(input); }
    else if (input) job.child.stdin.write(input);
    return this.get(workspaceId)!;
  }

  stop(workspaceId: string, jobId: string): CommandSnapshot {
    const job = this.current(workspaceId, jobId);
    if (job.state.status === "running") { job.stopped = true; job.child.kill("SIGKILL"); }
    return this.get(workspaceId)!;
  }

  dispose(): void {
    for (const job of this.jobs.values()) if (job.state.status === "running") { job.stopped = true; job.child.kill("SIGKILL"); }
    this.jobs.clear();
  }

  private current(workspaceId: string, jobId: string): Job {
    const job = this.jobs.get(workspaceId);
    if (!job || job.state.id !== jobId) throw new Error("Command not found or replaced by a newer command.");
    return job;
  }
}
