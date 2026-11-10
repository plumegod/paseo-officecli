import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { OfficePreview } from "./client/preview";
import { OfficeSettings } from "./client/settings";

function OfficeItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="FileText" active={currentScreen?.screenId === "officecli"} onPress={() => openScreen({ screenId: "officecli" })} />;
}

export default function contribute(client: PluginClientContext) {
  const cleanup = [
    client.addFilePanel({ id: "officecli", title: "OfficeCLI", icon: "FileText", files: { extensions: ["docx", "xlsx", "pptx"] }, Component: OfficePreview }),
    client.addSettingsScreen({ id: "officecli", title: "OfficeCLI", icon: "FileText", Component: OfficeSettings }),
    client.addScreen({ id: "officecli", title: "OfficeCLI", Component: OfficeSettings }),
    client.addSidebarHeaderItem({ id: "officecli", title: "OfficeCLI", Component: OfficeItem }),
  ];
  return () => { for (const stop of cleanup) stop(); };
}
