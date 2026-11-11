import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CommandSnapshot } from "../shared/commands";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, extname, isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { message } from "../shared/messages.ts";

const execute = promisify(execFile);
export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export async function resolveExecutable(configured = "", env = process.env): Promise<string> {
  const explicit = configured.trim() || env.OFFICECLI_PATH?.trim();
  if (explicit) {
    if (!isAbsolute(explicit) || explicit.includes("\0")) throw new Error(message("pathAbsolute"));
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
  throw new Error(message("executableMissing"));
}

export async function runOfficeCli(executable: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execute(executable, args, {
      encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: MAX_OUTPUT_BYTES,
    });
    return stdout;
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; killed?: boolean; code?: string | number };
    if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error(message("previewLimit"));
    if (failure.killed) throw new Error(message("cliTimeout"));
    const output = [failure.stderr, failure.stdout].filter(Boolean).join("\n") || failure.message;
    throw new Error(message("cliFailed", { code: failure.code ?? "?", detail: output.trim().slice(0, 2000) }));
  }
}

export async function resolveDocument(root: string, path: string): Promise<string> {
  if (!isAbsolute(path) || path.includes("\0")) throw new Error(message("documentAbsolute"));
  const [realRoot, target] = await Promise.all([realpath(root), realpath(path)]);
  const inside = relative(realRoot, target);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(message("documentBoundary"));
  }
  if (![".docx", ".xlsx", ".pptx"].includes(extname(target).toLowerCase())) throw new Error(message("documentType"));
  if (!(await stat(target)).isFile()) throw new Error(message("documentFile"));
  return target;
}

export async function renderDocument(executable: string, path: string): Promise<string> {
  const html = await runOfficeCli(executable, ["view", path, "html"]);
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error(message("invalidHtml"));
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
    if (this.jobs.get(workspaceId)?.state.status === "running") throw new Error(message("commandRunning"));
    if (!this.jobs.has(workspaceId) && this.jobs.size >= 8) {
      const oldestFinished = [...this.jobs].find(([, job]) => job.state.status !== "running");
      if (!oldestFinished) throw new Error(message("workspaceLimit"));
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
        job.state.error = message("outputLimit");
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
    if (job.state.status !== "running" || !job.state.stdinOpen || job.child.stdin.destroyed) throw new Error(message("stdinClosed"));
    if (job.child.stdin.writableLength + Buffer.byteLength(input) > 4 * 1024 * 1024) throw new Error(message("stdinBusy"));
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
    if (!job || job.state.id !== jobId) throw new Error(message("commandMissing"));
    return job;
  }
}
