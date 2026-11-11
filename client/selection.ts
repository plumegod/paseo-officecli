import type { PluginClientContext, PluginComposer } from "@getpaseo/plugin/client";
import { selectionSearchRpc } from "../shared/officecli.ts";

function composerInWorkspace(client: PluginClientContext, workspaceId: string, agents: { id: string; workspaceId?: string }[]) {
  const local = agents
    .filter((agent) => agent.workspaceId === workspaceId)
    .flatMap((agent) => [...client.composers({ agentId: agent.id })]);
  const [focused] = client.composers({ focused: true });
  return (focused && local.includes(focused) ? focused : local[0]) ?? null;
}

async function attach(client: PluginClientContext, workspaceId: string, sourceId: string, token: string, stale: () => boolean) {
  const { items } = await client.rpc(selectionSearchRpc, { query: token });
  const item = items[0];
  if (stale() || !item) return;
  const listed = await client.paseo.agents.list({ page: { limit: 50 } }).catch(() => ({ entries: [] as { agent: { id: string; workspaceId?: string } }[] }));
  if (stale()) return;
  const target: PluginComposer | null = composerInWorkspace(client, workspaceId, listed.entries.map((entry) => entry.agent));
  if (!target) return;
  target.addAttachment({ sourceId, item });
  await target.focus().catch(() => {});
}

export function createSelectionSource(client: PluginClientContext) {
  let generation = 0;
  let remove: (() => void) | undefined;
  const clear = () => {
    generation++;
    remove?.();
    remove = undefined;
  };
  const begin = (workspaceId: string, fileName: string) => {
    clear();
    const current = generation;
    let published = false;
    return (token: string) => {
      if (current !== generation || published) return false;
      const sourceId = `office-selection-${crypto.randomUUID()}`;
      remove = client.addAttachmentSource({
        id: sourceId,
        title: `Office 选区 · ${fileName} · ${workspaceId}`,
        icon: "FileText",
        pickerTitle: `添加 Office 选区 · ${fileName}`,
        searchPlaceholder: "选择已准备的选区",
        search: selectionSearchRpc,
      });
      published = true;
      void attach(client, workspaceId, sourceId, token, () => current !== generation);
      return true;
    };
  };
  return { begin, clear };
}
