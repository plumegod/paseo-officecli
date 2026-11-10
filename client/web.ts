import { createElement } from "react";
import { Platform } from "react-native";

// Only the browser/desktop needs these APIs; the plugin does not require DOM typings.
interface HtmlBlob { readonly size: number; readonly type: string }
declare const Blob: new (parts: string[], options: { type: string }) => HtmlBlob;
declare const URL: { createObjectURL(blob: HtmlBlob): string; revokeObjectURL(url: string): void };

export const supportsPreview = Platform.OS === "web";

export function createPreviewUrl(html: string): string {
  // Keep official interactions while blocking external subresources; the sandbox isolates Paseo's origin.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;">`;
  return URL.createObjectURL(new Blob([html.replace(/<head(?:\s[^>]*)?>/i, `$&${policy}`)], { type: "text/html;charset=utf-8" }));
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export function PreviewFrame({ url, name }: { url: string; name: string }) {
  // Never add allow-same-origin: Office content must not reach the host or its credentials.
  return createElement("iframe", {
    src: url, title: `OfficeCLI preview: ${name}`, sandbox: "allow-scripts",
    referrerPolicy: "no-referrer",
    style: { flex: 1, width: "100%", height: "100%", border: 0, background: "#fff" },
  });
}
