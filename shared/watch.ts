import { z } from "zod";

export const MAX_WATCH_BODY = 64 * 1024;
const path = z.string().min(1).max(2048).regex(/^\/[^\u0000-\u001f]*$/);
export const selectionPaths = z.array(path).max(1000);
export const MAX_SELECTION_PATHS = 10;
const cell = z.object({ path: path.regex(/^\/[^/]+\/[A-Z]+[1-9]\d*$/), prop: z.literal("text"), value: z.string() }).strict();
const coordinate = z.string().regex(/^\d{1,7}$/);
const chart = z.object({ path: path.regex(/^\/[^/]+\/chart\[[1-9]\d*\]$/), props: z.object({ x: coordinate, y: coordinate }).strict() }).strict();
export const watchRequest = z.discriminatedUnion("route", [
  z.object({ route: z.literal("/"), method: z.literal("GET") }).strict(),
  z.object({ route: z.literal("/api/selection"), method: z.literal("POST"), body: z.object({ paths: selectionPaths }).strict() }).strict(),
  z.object({ route: z.literal("/api/send"), method: z.literal("POST"), body: z.union([cell, chart]) }).strict(),
]);
export type WatchRequest = z.infer<typeof watchRequest>;
export const bridgeMessage = z.discriminatedUnion("kind", [
  z.object({ channel: z.uuid(), id: z.number().int().positive(), kind: z.literal("request"), route: z.enum(["/", "/api/selection", "/api/send"]), method: z.enum(["GET", "POST"]), body: z.string().max(MAX_WATCH_BODY) }).strict(),
  z.object({ channel: z.uuid(), id: z.number().int().positive(), kind: z.literal("events"), after: z.number().int().nonnegative() }).strict(),
]);
export const watchState = z.object({ revision: z.number().int().nonnegative(), savedRevision: z.number().int().nonnegative().nullable(), lastWrite: z.enum(["none", "pending", "applied", "unconfirmed"]) });
export const watchEvent = z.object({ id: z.number().int().positive(), type: z.string(), data: z.string() });
export type WatchState = z.infer<typeof watchState>;
export type WatchEvent = z.infer<typeof watchEvent>;

export function selectionUpdate(event: WatchEvent): string[] | null {
  if (event.type !== "update") return null;
  try {
    const message = JSON.parse(event.data);
    if (message?.action !== "selection-update") return null;
    const paths = selectionPaths.safeParse(message.paths ?? []);
    return paths.success ? paths.data : [];
  } catch { return null; }
}
