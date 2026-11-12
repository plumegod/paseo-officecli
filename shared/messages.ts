import { translate, type MessageKey } from "./locales.ts";

const prefix = "OFFICECLI_MESSAGE:";
export type MessageValues = Record<string, string | number | WireMessage>;
export interface WireMessage { code: MessageKey; values: MessageValues }

// RPC errors expose only Error.message, so carry structured, locale-neutral data in it.
export function message(code: MessageKey, values: MessageValues = {}): string {
  return prefix + JSON.stringify({ code, values });
}
export function nested(value: string): string | WireMessage {
  const parsed = parse(value);
  return parsed ?? value;
}
function parse(value: string): WireMessage | null {
  // Paseo's RPC error adds a prefix and metadata around the original plugin message.
  const clean = value.replace(/^(?:Error: )+/, "").replace(/^(?:DaemonRpcError: )?Request failed: (OFFICECLI_MESSAGE:\{.*\}) requestType=plugin\.rpc\.invoke\.request code=handler_error$/s, "$1");
  if (!clean.startsWith(prefix)) return null;
  try {
    const result = JSON.parse(clean.slice(prefix.length));
    return typeof result?.code === "string" && result.values && typeof result.values === "object" && !Array.isArray(result.values) ? result : null;
  } catch { return null; }
}
export function displayMessage(locale: string, value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const wire = parse(raw);
  if (!wire) return raw; // Official output, OS/SDK errors and user content stay verbatim.
  function render(item: WireMessage, depth = 0): string {
    if (depth > 12) return item.code;
    const values = Object.fromEntries(Object.entries(item.values).map(([key, value]) => [key,
      value && typeof value === "object" && typeof value.code === "string" && value.values ? render(value, depth + 1) : value,
    ]));
    return translate(locale, item.code, values);
  }
  return render(wire);
}
