import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { extname, resolve } from "node:path";
import { MAX_OUTPUT_BYTES, resolveDocument, runOfficeCli } from "./officecli.ts";
import { MAX_SELECTION_BYTES, SelectionStore } from "./selection.ts";
import { MAX_SELECTION_PATHS, MAX_WATCH_BODY, selectionPaths, watchRequest, type WatchEvent, type WatchRequest, type WatchState } from "../shared/watch.ts";

import { message, nested } from "../shared/messages.ts";

const LEASE_MS = 45_000;
type Session = {
  path: string; executable: string; child: ChildProcess; ready: Promise<void>; port: number;
  abort: AbortController; error: string | null; closing: Promise<void> | null; queue: Promise<unknown>;
  events: WatchEvent[]; cursor: number; bytes: number; state: WatchState;
};
type Lease = { workspace: string; session: Session; touched: number };

// HTTP success only acknowledges transport; /api/send wraps the CLI's own JSON verdict.
export function officialResult(text: string, wrapped = false): { data?: unknown } {
  let result;
  try {
    result = JSON.parse(text);
    if (wrapped) {
      if (result.success !== true) throw new Error(result.message || message("watchRejected"));
      result = JSON.parse(result.message);
    }
  } catch (error) { throw new Error(message("officialResult", { detail: nested(String(error).slice(0, 500)) })); }
  if (result?.success !== true) throw new Error(message("officialError", { detail: JSON.stringify(result?.error || result?.message || result).slice(0, 2000) }));
  return result;
}

async function textResponse(response: Response): Promise<string> {
  if (!response.ok) throw new Error(message("watchHttp", { code: response.status }));
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (!response.body) return ""; // Official selection updates acknowledge with HTTP 204.
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_OUTPUT_BYTES) throw new Error(message("watchResponseLimit"));
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class WatchManager {
  private sessions = new Map<string, Session>();
  private leases = new Map<string, Lease>();
  private selections = new SelectionStore();
  private disposed = false;
  private sweep = setInterval(() => {
    for (const [id, lease] of this.leases) {
      if (Date.now() - lease.touched > LEASE_MS) void this.close(lease.workspace, id);
    }
  }, 10_000).unref();

  async open(workspace: string, root: string, path: string, executable: string) {
    const document = await resolveDocument(root, path);
    const key = process.platform === "win32" ? document.toLowerCase() : document;
    let session = this.sessions.get(key);
    if (session?.closing) { await session.closing; session = this.sessions.get(key); }
    if (this.disposed) throw new Error(message("pluginStopped"));
    if (!session) {
      if (this.sessions.size >= 8) throw new Error(message("watchLimit"));
      const child = spawn(executable, ["watch", document, "--port", "0"], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      session = { path: document, executable, child, ready: Promise.resolve(), port: 0, abort: new AbortController(), error: null, closing: null, queue: Promise.resolve(), events: [], cursor: 0, bytes: 0, state: { revision: 0, savedRevision: null, lastWrite: "none" } };
      this.sessions.set(key, session);
      session.ready = this.start(session);
    }
    try { await session.ready; this.healthy(session); }
    catch (error) { await this.stop(session); throw error; }
    const leaseId = randomUUID();
    this.leases.set(leaseId, { workspace, session, touched: Date.now() });
    try {
      await this.identity(session);
      const cursor = session.cursor;
      return { leaseId, html: await this.http(session, "/"), cursor, ...session.state };
    } catch (error) { await this.close(workspace, leaseId); throw error; }
  }

  async request(workspace: string, root: string, leaseId: string, input: WatchRequest) {
    const request = watchRequest.parse(input);
    if (Buffer.byteLength(JSON.stringify(request)) > MAX_WATCH_BODY) throw new Error(message("watchRequestLimit"));
    const session = await this.current(workspace, root, leaseId);
    return this.serialize(session, async () => {
      await this.identity(session);
      const mutation = request.route === "/api/send";
      if (mutation) { session.state.revision++; session.state.savedRevision = null; session.state.lastWrite = "pending"; }
      try {
        const body = await this.http(session, request.route, request.method === "POST" ? request.body : undefined);
        if (mutation) { officialResult(body, true); session.state.lastWrite = "applied"; }
        return { body, ...session.state };
      } catch (error) {
        if (mutation) session.state.lastWrite = "unconfirmed";
        throw error;
      }
    });
  }

  async events(workspace: string, root: string, leaseId: string, after: number) {
    const session = await this.current(workspace, root, leaseId);
    if (!Number.isSafeInteger(after) || after < 0 || after > session.cursor) throw new Error(message("watchCursor"));
    const reload = after < (session.events[0]?.id ?? session.cursor + 1) - 1;
    return { events: reload ? [] : session.events.filter((event) => event.id > after), cursor: session.cursor, reload, ...session.state };
  }

  async save(workspace: string, root: string, leaseId: string) {
    const session = await this.current(workspace, root, leaseId);
    return this.serialize(session, async () => {
      await this.identity(session);
      officialResult(await runOfficeCli(session.executable, ["save", session.path, "--json"]));
      session.state.savedRevision = session.state.revision;
      return { ...session.state };
    });
  }

  async prepareSelection(workspace: string, root: string, leaseId: string, input: string[]) {
    const paths = selectionPaths.min(1).max(MAX_SELECTION_PATHS).parse(input);
    const session = await this.current(workspace, root, leaseId);
    if (![".docx", ".pptx"].includes(extname(session.path).toLowerCase())) throw new Error(message("selectionFormats"));
    return this.serialize(session, async () => {
      await this.identity(session);
      let bytes = 0;
      const nodes: Array<{ path: string; text?: unknown; children?: unknown; [key: string]: unknown }> = [];
      for (const path of paths) {
        const output = await runOfficeCli(session.executable, ["get", session.path, path, "--depth", "4", "--json"]);
        bytes += Buffer.byteLength(output);
        if (bytes > MAX_SELECTION_BYTES) throw new Error(message("selectionBytes"));
        const data = officialResult(output).data as { matches?: number; results?: Array<{ path?: unknown; text?: unknown; children?: unknown }> } | undefined;
        const node = data?.results?.[0];
        if (!Array.isArray(data?.results) || data.matches !== 1 || data.results.length !== 1 || typeof node?.path !== "string" || !node.path.startsWith("/")) {
          throw new Error(message("selectionMissing", { path }));
        }
        nodes.push(node as { path: string; text?: unknown; children?: unknown });
      }
      await this.identity(session);
      return this.selections.prepare(session.path, nodes);
    });
  }

  searchSelection(query: string) { return this.selections.search(query); }

  async close(workspace: string, leaseId: string) {
    const lease = this.leases.get(leaseId);
    if (!lease) return;
    if (lease.workspace !== workspace) throw new Error(message("watchWorkspace"));
    this.leases.delete(leaseId);
    if (![...this.leases.values()].some((other) => other.session === lease.session)) await this.stop(lease.session);
  }

  async dispose() {
    this.disposed = true;
    clearInterval(this.sweep);
    this.selections.clear();
    this.leases.clear();
    await Promise.all([...this.sessions.values()].map((session) => this.stop(session)));
  }

  private async current(workspace: string, root: string, leaseId: string) {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.workspace !== workspace) throw new Error(message("watchExpired"));
    this.healthy(lease.session);
    if (await resolveDocument(root, lease.session.path) !== lease.session.path) throw new Error(message("documentChanged"));
    lease.touched = Date.now();
    return lease.session;
  }

  private healthy(session: Session) {
    if (session.error || session.closing || this.disposed) throw new Error(session.error || message("watchClosed"));
  }

  private async serialize<T>(session: Session, action: () => Promise<T>): Promise<T> {
    const result = session.queue.then(() => { this.healthy(session); return action(); });
    session.queue = result.catch(() => {});
    return result;
  }

  private async http(session: Session, route: string, body?: unknown) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    session.abort.signal.addEventListener("abort", abort, { once: true });
    if (session.abort.signal.aborted) abort();
    const timeout = setTimeout(abort, 60_000);
    try {
      return await textResponse(await fetch(`http://127.0.0.1:${session.port}${route}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error", signal: controller.signal,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }));
    } finally { clearTimeout(timeout); session.abort.signal.removeEventListener("abort", abort); }
  }

  private async identity(session: Session) {
    this.healthy(session);
    let status;
    try { status = JSON.parse(await this.http(session, "/api/status")); }
    catch (error) { throw new Error(message("watchIdentity", { detail: nested(String(error)) })); }
    const actual = typeof status.file === "string" ? resolve(status.file) : "";
    const equal = process.platform === "win32" ? actual.toLowerCase() === session.path.toLowerCase() : actual === session.path;
    if (!equal) { session.error = message("watchChanged"); throw new Error(session.error); }
  }

  private async start(session: Session) {
    let log = "";
    await new Promise<void>((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error(message("watchStartTimeout", { detail: log }))), 15_000);
      const done = (error?: Error) => { clearTimeout(timeout); if (error) reject(error); else accept(); };
      session.child.on("error", (error) => { session.error = error.message; done(error); });
      session.child.on("exit", (code, signal) => {
        session.error = message("watchExit", { code: signal || code || "?", detail: log });
        done(new Error(session.error));
        session.abort.abort();
      });
      const append = (text: string) => {
        log = (log + text).slice(-8192);
        const match = log.match(/Watch: http:\/\/localhost:(\d+)\r?\n/);
        if (match) {
          const port = Number(match[1]);
          if (port > 0 && port < 65536) { session.port = port; done(); }
        }
      };
      session.child.stdout!.setEncoding("utf8").on("data", append);
      session.child.stderr!.setEncoding("utf8").on("data", append);
    });
    await this.identity(session);
    const html = await this.http(session, "/");
    if (!html.includes("EventSource('/events')") || !html.includes("/api/selection")) throw new Error(message("watchProtocol"));
    void this.stream(session).catch((error: Error) => {
      if (!session.closing) session.error = message("watchConnection", { detail: nested(error.message) });
    });
  }

  private async stream(session: Session) {
    const response = await fetch(`http://127.0.0.1:${session.port}/events`, { redirect: "error", signal: session.abort.signal });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) throw new Error(message("watchSse"));
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of response.body) {
      pending = (pending + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
      if (Buffer.byteLength(pending) > MAX_OUTPUT_BYTES) throw new Error(message("watchEventLimit"));
      let end;
      while ((end = pending.indexOf("\n\n")) >= 0) {
        const packet = pending.slice(0, end); pending = pending.slice(end + 2);
        const type = packet.match(/^event: ?([^\n]+)/m)?.[1] || "message";
        const data = packet.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
        if (!data) continue;
        if (type === "doc-switched") throw new Error(message("watchSwitched"));
        const event = { id: ++session.cursor, type, data };
        session.events.push(event); session.bytes += Buffer.byteLength(data);
        while (session.events.length > 256 || session.bytes > MAX_OUTPUT_BYTES) session.bytes -= Buffer.byteLength(session.events.shift()!.data);
      }
    }
    throw new Error(message("watchEnded"));
  }

  private stop(session: Session): Promise<void> {
    if (session.closing) return session.closing;
    session.closing = (async () => {
      await session.queue;
      session.abort.abort();
      if (session.child.exitCode === null && session.child.signalCode === null) {
        await new Promise<void>((done) => {
          const timeout = setTimeout(done, 2000);
          session.child.once("exit", () => { clearTimeout(timeout); done(); });
          session.child.kill();
        });
      }
      for (const [key, value] of this.sessions) if (value === session) this.sessions.delete(key);
    })();
    return session.closing;
  }
}
