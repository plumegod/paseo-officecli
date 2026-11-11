import type { PluginClientContext, PluginFilePanelProps } from "@getpaseo/plugin/client";
import { OfficePreview } from "./client/preview";
import { createSelectionSource } from "./client/selection";
import { OfficeSettings } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  const selections = createSelectionSource(client);
  const cleanup = [
    client.addFilePanel({ id: "officecli", title: "OfficeCLI", icon: "FileText", files: { extensions: ["docx", "xlsx", "pptx"] }, Component: (props: PluginFilePanelProps) => <OfficePreview {...props} beginSelection={selections.begin} /> }),
    client.addSettingsScreen({ id: "officecli", title: "OfficeCLI", icon: "FileText", Component: OfficeSettings }),
    selections.clear,
  ];
  return () => { for (const stop of cleanup) stop(); };
}
