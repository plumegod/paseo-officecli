import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { commandArgs, commandSnapshot, MAX_INPUT_CHARS } from "./commands";

export const officeSettings = defineSettings({
  id: "officecli",
  scope: "host",
  version: 1,
  schema: z.object({ executable: z.string().max(4096).default("") }),
});

export const statusRpc = defineRpc({
  name: "officecli.status",
  input: z.object({}),
  output: z.object({ executable: z.string(), version: z.string() }),
});

export const previewRpc = defineRpc({
  name: "officecli.preview",
  input: z.object({ workspaceId: z.string().min(1), path: z.string().min(1).max(32768) }),
  output: z.object({ html: z.string() }),
});

const workspaceId = z.string().min(1).max(1024);
const jobId = z.uuid();
const input = z.string().max(MAX_INPUT_CHARS);
export const commandStateRpc = defineRpc({
  name: "officecli.command.state",
  input: z.object({ workspaceId }),
  output: z.object({ directory: z.string(), executable: z.string(), job: commandSnapshot.nullable() }),
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
