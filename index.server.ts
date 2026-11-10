import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { realpath } from "node:fs/promises";
import { commandInputRpc, commandStartRpc, commandStateRpc, commandStopRpc, officeSettings, previewRpc, statusRpc } from "./shared/officecli";
import { CommandRunner, renderDocument, resolveDocument, resolveExecutable, runOfficeCli } from "./server/officecli";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(officeSettings);
  const commands = new CommandRunner();
  async function directory(workspaceId: string, paseo: PluginHandlerContext["paseo"]) {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    const root = workspace?.workspaceDirectory || workspace?.projectRootPath;
    if (!root) throw new Error("Workspace not found or has no directory.");
    return realpath(root);
  }
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
    const document = await resolveDocument(await directory(workspaceId, paseo), path);
    return { html: await renderDocument(await executable(), document) };
  });
  server.handle(commandStateRpc, async ({ workspaceId }, { paseo }) => ({
    directory: await directory(workspaceId, paseo), executable: await executable(), job: commands.get(workspaceId),
  }));
  server.handle(commandStartRpc, async ({ workspaceId, args, input, keepStdinOpen }, { paseo }) => {
    const cwd = await directory(workspaceId, paseo);
    return commands.start(workspaceId, cwd, await executable(), args, input, keepStdinOpen);
  });
  server.handle(commandInputRpc, async ({ workspaceId, jobId, input, eof }, { paseo }) => {
    await directory(workspaceId, paseo);
    return commands.input(workspaceId, jobId, input, eof);
  });
  server.handle(commandStopRpc, async ({ workspaceId, jobId }, { paseo }) => {
    await directory(workspaceId, paseo);
    return commands.stop(workspaceId, jobId);
  });
  return () => commands.dispose();
}
