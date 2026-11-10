import { z } from "zod";

export const MAX_INPUT_CHARS = 1024 * 1024;
export const commandArgs = z.array(z.string().refine((value) => !value.includes("\0"), "Arguments cannot contain NUL."))
  .min(1).max(1024)
  .refine((args) => !!args[0]?.trim(), "A command or option is required.")
  .refine((args) => JSON.stringify(args).length <= MAX_INPUT_CHARS, "Arguments exceed 1 MiB of text.");

export function parseArguments(text: string): string[] {
  if (text.length > MAX_INPUT_CHARS) throw new Error("Arguments exceed 1 MiB of text.");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('参数必须是 JSON 字符串数组，例如 ["help"]。'); }
  const parsed = commandArgs.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid argv: ${parsed.error.issues[0].message}`);
  return parsed.data;
}

export const commandSnapshot = z.object({
  id: z.string(), executable: z.string(), cwd: z.string(), args: commandArgs,
  status: z.enum(["running", "completed", "failed", "stopped"]),
  stdout: z.string(), stderr: z.string(), error: z.string().nullable(),
  exitCode: z.number().nullable(), signal: z.string().nullable(), stdinOpen: z.boolean(),
});
export type CommandSnapshot = z.infer<typeof commandSnapshot>;
