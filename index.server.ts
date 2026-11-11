import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { realpath } from "node:fs/promises";
import { commandInputRpc, commandStartRpc, commandStateRpc, commandStopRpc, officeSettings, previewRpc, selectionPrepareRpc, selectionSearchRpc, statusRpc, watchOpenRpc, watchRequestRpc, watchEventsRpc, watchSaveRpc, watchCloseRpc } from "./shared/officecli";
import { CommandRunner, renderDocument, resolveDocument, resolveExecutable } from "./server/officecli";
import { InstallationInspector, requireInstallation } from "./server/installation";
import { WatchManager } from "./server/watch";
import { message } from "./shared/messages";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(officeSettings);
  const commands = new CommandRunner();
  const watches = new WatchManager();
  const inspector = new InstallationInspector();
  async function directory(workspaceId: string, paseo: PluginHandlerContext["paseo"]) {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    const root = workspace?.workspaceDirectory || workspace?.projectRootPath;
    if (!root) throw new Error(message("workspaceMissing"));
    return realpath(root);
  }
  async function executable() {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(state.error);
    return resolveExecutable(state.values.executable);
  }
  async function installation(refresh = false) {
    return inspector.check(await executable(), refresh);
  }
  async function execution(automatic = false) {
    const status = await installation();
    requireInstallation(status, automatic);
    return status;
  }
  server.handle(statusRpc, async ({ refresh }) => installation(refresh));
  server.handle(previewRpc, async ({ workspaceId, path }, { paseo }) => {
    const document = await resolveDocument(await directory(workspaceId, paseo), path);
    const status = await execution(true);
    if (status.capabilities.htmlPreview.status === "missing") throw new Error(status.capabilities.htmlPreview.diagnostic);
    return { html: await renderDocument(status.executable, document) };
  });
  server.handle(commandStateRpc, async ({ workspaceId }, { paseo }) => {
    const status = await installation();
    return { directory: await directory(workspaceId, paseo), executable: status.executable, installation: status, job: commands.get(workspaceId) };
  });
  server.handle(commandStartRpc, async ({ workspaceId, args, input, keepStdinOpen }, { paseo }) => {
    const cwd = await directory(workspaceId, paseo);
    return commands.start(workspaceId, cwd, (await execution()).executable, args, input, keepStdinOpen);
  });
  server.handle(commandInputRpc, async ({ workspaceId, jobId, input, eof }, { paseo }) => {
    await directory(workspaceId, paseo);
    await execution();
    return commands.input(workspaceId, jobId, input, eof);
  });
  server.handle(commandStopRpc, async ({ workspaceId, jobId }, { paseo }) => {
    await directory(workspaceId, paseo);
    return commands.stop(workspaceId, jobId);
  });
  server.handle(watchOpenRpc, async ({ workspaceId, path }, { paseo }) =>
    watches.open(workspaceId, await directory(workspaceId, paseo), path, (await execution(true)).executable));
  server.handle(watchRequestRpc, async ({ workspaceId, leaseId, request }, { paseo }) => {
    await execution(true);
    return watches.request(workspaceId, await directory(workspaceId, paseo), leaseId, request);
  });
  server.handle(watchEventsRpc, async ({ workspaceId, leaseId, after }, { paseo }) =>
    watches.events(workspaceId, await directory(workspaceId, paseo), leaseId, after));
  server.handle(watchSaveRpc, async ({ workspaceId, leaseId }, { paseo }) => {
    const status = await execution(true);
    if (status.capabilities.save.status === "missing") throw new Error(status.capabilities.save.diagnostic);
    return watches.save(workspaceId, await directory(workspaceId, paseo), leaseId);
  });
  server.handle(selectionPrepareRpc, async ({ workspaceId, leaseId, paths }, { paseo }) =>
    watches.prepareSelection(workspaceId, await directory(workspaceId, paseo), leaseId, paths));
  server.handle(selectionSearchRpc, async ({ query }) => watches.searchSelection(query));
  server.handle(watchCloseRpc, async ({ workspaceId, leaseId }, { paseo }) => {
    await directory(workspaceId, paseo);
    await watches.close(workspaceId, leaseId);
    return {};
  });
  return async () => { commands.dispose(); await watches.dispose(); };
}
