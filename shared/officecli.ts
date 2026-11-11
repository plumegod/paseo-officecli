import { defineRpc, defineSettings, PluginAttachmentSearchPayloadSchema } from "@getpaseo/plugin";
import { z } from "zod";
import { commandArgs, commandSnapshot, MAX_INPUT_CHARS } from "./commands.ts";
import { MAX_SELECTION_PATHS, selectionPaths, watchEvent, watchRequest, watchState } from "./watch.ts";

export const officeSettings = defineSettings({
  id: "officecli",
  scope: "host",
  version: 1,
  schema: z.object({ executable: z.string().max(4096).default("") }),
});

const capability = z.object({ status: z.enum(["supported", "missing", "unknown"]), diagnostic: z.string() });
export const installationStatus = z.object({
  executable: z.string(), version: z.string(),
  compatibility: z.enum(["supported", "upgrade-required", "unknown"]), diagnostic: z.string(),
  capabilities: z.object({ htmlPreview: capability, get: capability, batch: capability, save: capability, mcp: capability }),
});
export type InstallationStatus = z.infer<typeof installationStatus>;
export type Capability = z.infer<typeof capability>;

export const statusRpc = defineRpc({
  name: "officecli.status",
  input: z.object({ refresh: z.boolean().optional() }),
  output: installationStatus,
});

export const previewRpc = defineRpc({
  name: "officecli.preview",
  input: z.object({ workspaceId: z.string().min(1), path: z.string().min(1).max(32768) }),
  output: z.object({ html: z.string() }),
});

const workspaceId = z.string().min(1).max(1024);
const leaseId = z.uuid();
const watchInput = z.object({ workspaceId, leaseId });
export const watchOpenRpc = defineRpc({
  name: "officecli.watch.open",
  input: z.object({ workspaceId, path: z.string().min(1).max(32768) }),
  output: watchState.extend({ leaseId, html: z.string(), cursor: z.number().int().nonnegative() }),
});
export const watchRequestRpc = defineRpc({
  name: "officecli.watch.request",
  input: watchInput.extend({ request: watchRequest }),
  output: watchState.extend({ body: z.string() }),
});
export const watchEventsRpc = defineRpc({
  name: "officecli.watch.events",
  input: watchInput.extend({ after: z.number().int().nonnegative() }),
  output: watchState.extend({ events: z.array(watchEvent), cursor: z.number().int().nonnegative(), reload: z.boolean() }),
});
export const watchSaveRpc = defineRpc({ name: "officecli.watch.save", input: watchInput, output: watchState });
export const watchCloseRpc = defineRpc({ name: "officecli.watch.close", input: watchInput, output: z.object({}) });
export const selectionPrepareRpc = defineRpc({
  name: "officecli.selection.prepare",
  input: watchInput.extend({ paths: selectionPaths.min(1).max(MAX_SELECTION_PATHS) }),
  output: z.object({ token: z.uuid(), preview: z.string() }),
});
export const selectionSearchRpc = defineRpc({
  name: "officecli.selection.search",
  input: z.object({ query: z.string().max(1024) }),
  output: PluginAttachmentSearchPayloadSchema,
});

const jobId = z.uuid();
const input = z.string().max(MAX_INPUT_CHARS);
export const commandStateRpc = defineRpc({
  name: "officecli.command.state",
  input: z.object({ workspaceId }),
  output: z.object({ directory: z.string(), executable: z.string(), installation: installationStatus, job: commandSnapshot.nullable() }),
});
export const commandStartRpc = defineRpc({
  name: "officecli.command.start",
  input: z.object({ workspaceId, args: commandArgs, input, keepStdinOpen: z.boolean(), confirmed: z.literal(true) }),
  output: commandSnapshot,
});
export const commandInputRpc = defineRpc({
  name: "officecli.command.input",
  input: z.object({ workspaceId, jobId, input, eof: z.boolean() }),
  output: commandSnapshot,
});
export const commandStopRpc = defineRpc({
  name: "officecli.command.stop",
  input: z.object({ workspaceId, jobId }),
  output: commandSnapshot,
});
