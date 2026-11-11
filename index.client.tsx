import type { PluginClientContext } from "@getpaseo/plugin/client";
import { OfficePreview } from "./client/preview";
import { OfficeSettings } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  const cleanup = [
    client.addFilePanel({ id: "officecli", title: "OfficeCLI", icon: "FileText", files: { extensions: ["docx", "xlsx", "pptx"] }, Component: OfficePreview }),
    client.addSettingsScreen({ id: "officecli", title: "OfficeCLI", icon: "FileText", Component: OfficeSettings }),
  ];
  return () => { for (const stop of cleanup) stop(); };
}
