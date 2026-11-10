import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { OfficePreview } from "./client/preview";
import { OfficeSettings } from "./client/settings";
import { CommandWorkspacePanel } from "./client/commands";

function OfficeItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="FileText" active={currentScreen?.screenId === "officecli"} onPress={() => openScreen({ screenId: "officecli" })} />;
}

export default function contribute(client: PluginClientContext) {
  const cleanup = [
    client.addFilePanel({ id: "officecli", title: "OfficeCLI", icon: "FileText", files: { extensions: ["docx", "xlsx", "pptx"] }, Component: OfficePreview }),
    client.addWorkspacePanel({ id: "commands", title: "OfficeCLI 命令", icon: "Terminal", Component: CommandWorkspacePanel }),
    client.addCommandCenterItem({ id: "commands", title: "OfficeCLI 命令工作台", icon: "Terminal", context: "workspace", keywords: ["officecli", "word", "excel", "powerpoint"], onSelect: ({ openPanel }) => openPanel("commands") }),
    client.addSettingsScreen({ id: "officecli", title: "OfficeCLI", icon: "FileText", Component: OfficeSettings }),
    client.addScreen({ id: "officecli", title: "OfficeCLI", Component: OfficeSettings }),
    client.addSidebarHeaderItem({ id: "officecli", title: "OfficeCLI", Component: OfficeItem }),
  ];
  return () => { for (const stop of cleanup) stop(); };
}
