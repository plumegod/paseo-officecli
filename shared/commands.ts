import { z } from "zod";
import { message } from "./messages.ts";

export const MAX_INPUT_CHARS = 1024 * 1024;
export const commandArgs = z.array(z.string().refine((value) => !value.includes("\0"), message("argsNul")))
  .min(1).max(1024)
  .refine((args) => !!args[0]?.trim(), message("argsRequired"))
  .refine((args) => JSON.stringify(args).length <= MAX_INPUT_CHARS, message("argsLimit"));

export function parseArguments(text: string): string[] {
  if (text.length > MAX_INPUT_CHARS) throw new Error(message("argsLimit"));
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(message("argsJson")); }
  const parsed = commandArgs.safeParse(value);
  if (!parsed.success) throw new Error(message("argsShape"));
  return parsed.data;
}

export const commandSnapshot = z.object({
  id: z.string(), executable: z.string(), cwd: z.string(), args: commandArgs,
  status: z.enum(["running", "completed", "failed", "stopped"]),
  stdout: z.string(), stderr: z.string(), error: z.string().nullable(),
  exitCode: z.number().nullable(), signal: z.string().nullable(), stdinOpen: z.boolean(),
});
export type CommandSnapshot = z.infer<typeof commandSnapshot>;
