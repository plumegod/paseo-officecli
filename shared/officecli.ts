import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

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
