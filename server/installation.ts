import type { Capability, InstallationStatus } from "../shared/officecli";
import { runOfficeCli } from "./officecli.ts";

const minimum = [1n, 0n, 160n];
const commands = ["get", "batch", "save", "mcp"] as const;
const unknown = (diagnostic: string): Capability => ({ status: "unknown", diagnostic });
const supported = (name: string): Capability => ({ status: "supported", diagnostic: `当前 help 声明支持 ${name}。` });
const missing = (name: string, diagnostic: string): Capability => ({ status: "missing", diagnostic: `当前 help 明确不支持 ${name}：${diagnostic}` });
const detail = (value: string) => value.trim().slice(0, 2000) || "（空输出）";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function explicitlyMissing(name: string, text: string): boolean {
  return new RegExp(`(?:unknown|unrecognized|unsupported|no such) command\\s+['\"\x60]${name}['\"\x60]`, "i").test(text);
}

function helpCapability(name: string, text: string, top = false, html = false): Capability {
  const label = html ? "view html" : name;
  const original = text;
  if (!top && explicitlyMissing(name, text)) return missing(label, detail(text));
  let data: unknown;
  try { data = JSON.parse(text); }
  catch {
    if (/^\s*[\[{]/.test(text)) return unknown(`help JSON 输出异常（${label}）：${detail(text)}`);
  }
  if (object(data)) {
    if (data.success === false) {
      const error = data.error;
      const diagnostic = detail(JSON.stringify(error ?? data));
      if (!top && (explicitlyMissing(name, diagnostic) || object(error) && error.command === name && ["unknown_command", "command_not_found", "unsupported_command"].includes(String(error.code)))) return missing(label, diagnostic);
      return unknown(`help 不可用（${label}）：${diagnostic}`);
    }
    if (object(data.data)) data = data.data;
    if (object(data)) {
      const entries = Array.isArray(data.commands) ? data.commands : [];
      const entry = top ? entries.find((entry: unknown) => entry === name || object(entry) && (entry.name === name || entry.command === name)) : data;
      if (object(entry) && (entry.command === name || entry.name === name) && entry.supported === false) return missing(label, detail(JSON.stringify(entry)));
      if (html && object(entry) && (entry.command === name || entry.name === name) && Array.isArray(entry.modes) && entry.modes.length && entry.modes.every((mode) => typeof mode === "string")) {
        return entry.modes.includes("html") ? supported(label) : missing(label, `modes = ${JSON.stringify(entry.modes)}`);
      }
      if (!html && (top && entry !== undefined || !top && (data.command === name || data.name === name))) return supported(label);
      text = typeof data.usage === "string" ? data.usage + "\n" + (typeof data.description === "string" ? data.description : "") : "";
    }
  } else if (data !== undefined) text = "";
  const usage = new RegExp(`^\\s*officecli(?:\\.exe)?\\s+${name}(?:\\s|$)`, "im").test(text);
  if (!html && (usage || top && new RegExp(`^\\s+${name}(?:\\s+[<\\[]|\\s{2,})`, "m").test(text))) return supported(label);
  if (html && usage) {
    if (/View mode:\s*[^\r\n]*\bhtml\b/i.test(text)) return supported(label);
    const modes = /View mode:\s*([a-z][\w-]*(?:\s*,\s*[a-z][\w-]*)*)\.?\s*$/im.exec(text);
    if (modes) return missing(label, `View mode: ${modes[1]}`);
  }
  return unknown(`无法从当前 help 确认 ${label}；不是命令缺失的结论。输出：${detail(original)}`);
}

export class InstallationInspector {
  private cache?: { executable: string; version: string; result: Promise<InstallationStatus> };
  private run: typeof runOfficeCli;

  constructor(run = runOfficeCli) { this.run = run; }

  async check(executable: string, refresh = false): Promise<InstallationStatus> {
    let version = "";
    let diagnostic = "";
    try { version = (await this.run(executable, ["--version"])).trim(); }
    catch (error) { diagnostic = `版本检查失败：${String(error)}`; }
    const match = /^(?:officecli\s+(?:version\s+)?)?v?(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(?:\+[\w.-]+)?$/i.exec(version);
    let compatibility: InstallationStatus["compatibility"] = "unknown";
    if (match) {
      const parts = match.slice(1, 4).map(BigInt);
      const different = parts.findIndex((part, index) => part !== minimum[index]);
      compatibility = (different < 0 ? !!match[4] : parts[different] < minimum[different]) ? "upgrade-required" : "supported";
      diagnostic = compatibility === "upgrade-required"
        ? `需要升级：OfficeCLI ${version} 低于最低版本 1.0.160。文档执行已停止；请按官方安装说明升级后重新检测：https://github.com/iOfficeAI/OfficeCLI#installation`
        : `OfficeCLI ${version} 达到最低版本 1.0.160；能力以当前 help 为准，不保证未知接口或事务语义。`;
    } else diagnostic = `${diagnostic || `无法识别版本输出：${detail(version)}`}。最低版本尚未确认，不自动打开文档；仍可确认后运行高级命令诊断。`;
    const pending = unknown("未检查能力；仅受支持的当前安装读取 help。");
    const status: InstallationStatus = { executable, version, compatibility, diagnostic, capabilities: { htmlPreview: pending, get: pending, batch: pending, save: pending, mcp: pending } };
    if (compatibility !== "supported") { this.cache = undefined; return status; }
    if (!refresh && this.cache?.executable === executable && this.cache.version === version) return this.cache.result;
    const result = this.capabilities(status);
    this.cache = { executable, version, result };
    return result;
  }

  private async capabilities(status: InstallationStatus): Promise<InstallationStatus> {
    let top = "";
    try { top = await this.run(status.executable, ["help", "--json"]); }
    catch (error) { status.diagnostic += `\nhelp 不可用：${String(error)}`; }
    const probe = async (name: string, html = false): Promise<Capability> => {
      try { return helpCapability(name, await this.run(status.executable, ["help", name, "--json"]), false, html); }
      catch (error) {
        const diagnostic = String(error);
        return explicitlyMissing(name, diagnostic) ? missing(html ? "view html" : name, diagnostic) : unknown(`help 检查失败（${name}）：${diagnostic}`);
      }
    };
    if (top && commands.every((name) => helpCapability(name, top, true).status === "unknown")) status.diagnostic += `\n全局 help 输出无法识别：${detail(top)}`;
    const view = helpCapability("view", top, true);
    await Promise.all([
      (view.status === "missing" ? Promise.resolve(view) : probe("view", true)).then((value) => { status.capabilities.htmlPreview = value; }),
      ...commands.map(async (name) => {
        const listed = helpCapability(name, top, true);
        const value = listed.status === "missing" || (name === "get" || name === "mcp") && listed.status !== "unknown" ? listed : await probe(name);
        status.capabilities[name] = value;
        return value;
      }),
    ]);
    return status;
  }
}

export function requireInstallation(status: InstallationStatus, automatic = false): void {
  if (status.compatibility === "upgrade-required" || automatic && status.compatibility !== "supported") throw new Error(status.diagnostic);
}
