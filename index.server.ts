import type { PluginServerContext } from "@getpaseo/plugin/server";
import { officeSettings, previewRpc, statusRpc } from "./shared/officecli";
import { renderDocument, resolveDocument, resolveExecutable, runOfficeCli } from "./server/officecli";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(officeSettings);
  async function executable() {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(state.error);
    return resolveExecutable(state.values.executable);
  }
  server.handle(statusRpc, async () => {
    const path = await executable();
    return { executable: path, version: (await runOfficeCli(path, ["--version"])).trim() };
  });
  server.handle(previewRpc, async ({ workspaceId, path }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    const root = workspace?.workspaceDirectory || workspace?.projectRootPath;
    if (!root) throw new Error("Workspace not found or has no directory.");
    const document = await resolveDocument(root, path);
    return { html: await renderDocument(await executable(), document) };
  });
  return () => {};
}
