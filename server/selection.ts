import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginAttachmentItem } from "@getpaseo/plugin";

export const MAX_SELECTION_BYTES = 256 * 1024;
type SelectionNode = { path: string; text?: unknown; children?: unknown; [key: string]: unknown };

export class SelectionStore {
  private items = new Map<string, PluginAttachmentItem>();

  prepare(document: string, nodes: SelectionNode[]) {
    const token = randomUUID();
    const text = "OfficeCLI 对象选区快照；不是实时选区。修改前请按下列路径重新读取并核对内容，若已变化请先询问用户。不要用 selected 作为修改目标。\n" +
      JSON.stringify({ file: document, capturedAt: new Date().toISOString(), objects: nodes }, null, 2);
    if (Buffer.byteLength(text) > MAX_SELECTION_BYTES) throw new Error("选区快照超过 256 KiB，请选择更少的对象。");
    const item: PluginAttachmentItem = {
      id: randomUUID(), identifier: extname(document).slice(1).toUpperCase(), title: basename(document),
      subtitle: `${nodes.length} 个选中对象`, url: pathToFileURL(document).href, text, resourceType: "officecli-selection",
    };
    const oldest = this.items.keys().next().value;
    if (this.items.size >= 20 && oldest) this.items.delete(oldest);
    this.items.set(token, item);
    return { token, preview: text };
  }

  search(query: string) {
    if (!query) {
      const last = [...this.items.values()].at(-1);
      return { items: last ? [last] : [] };
    }
    const item = this.items.get(query);
    return { items: item ? [item] : [] };
  }

  clear() { this.items.clear(); }
}
