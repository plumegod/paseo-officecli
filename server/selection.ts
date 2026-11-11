import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginAttachmentItem } from "@getpaseo/plugin";
import { message } from "../shared/messages.ts";
import { translate } from "../shared/locales.ts";

export const MAX_SELECTION_BYTES = 256 * 1024;
type SelectionNode = { path: string; text?: unknown; children?: unknown; [key: string]: unknown };

export class SelectionStore {
  private items = new Map<string, PluginAttachmentItem>();

  prepare(document: string, nodes: SelectionNode[]) {
    const token = randomUUID();
    const text = translate("en", "snapshotNotice") + // Stable agent instructions, not UI; snapshot data is never translated.

      JSON.stringify({ file: document, capturedAt: new Date().toISOString(), objects: nodes }, null, 2);
    if (Buffer.byteLength(text) > MAX_SELECTION_BYTES) throw new Error(message("selectionBytes"));
    const item: PluginAttachmentItem = {
      id: randomUUID(), identifier: extname(document).slice(1).toUpperCase(), title: basename(document),
      subtitle: String(nodes.length), url: pathToFileURL(document).href, text, resourceType: "officecli-selection",
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
