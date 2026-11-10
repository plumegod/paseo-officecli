import { createElement, type Ref } from "react";
import { Platform } from "react-native";
import { previewHtml } from "./preview-html.ts";

// Only the browser/desktop needs these APIs; the plugin does not require DOM typings.
interface HtmlBlob { readonly size: number; readonly type: string }
declare const Blob: new (parts: string[], options: { type: string }) => HtmlBlob;
declare const URL: { createObjectURL(blob: HtmlBlob): string; revokeObjectURL(url: string): void };

export const supportsPreview = Platform.OS === "web";

export function createPreviewUrl(html: string, bridge = ""): string {
  return URL.createObjectURL(new Blob([previewHtml(html, bridge)], { type: "text/html;charset=utf-8" }));
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export interface FrameWindow { postMessage(message: unknown, target: string): void }
export interface FrameHandle { contentWindow: FrameWindow | null }

export function PreviewFrame({ url, name, frameRef, onLoad }: { url: string; name: string; frameRef?: Ref<FrameHandle>; onLoad?: () => void }) {
  // Never add allow-same-origin: Office content must not reach the host or its credentials.
  return createElement("iframe", {
    src: url, ref: frameRef, onLoad, title: `OfficeCLI preview: ${name}`, sandbox: "allow-scripts",
    referrerPolicy: "no-referrer",
    style: { flex: 1, width: "100%", height: "100%", border: 0, background: "#fff" },
  });
}
