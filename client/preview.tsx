import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { previewRpc } from "../shared/officecli";
import { createPreviewUrl, PreviewFrame, revokePreviewUrl, supportsPreview } from "./web";
import { CommandConsole } from "./commands";
import { ActionButton } from "./controls";

export function OfficePreview({ workspaceId, file, revision, theme, layout }: PluginFilePanelProps) {
  const rpc = useRpc(previewRpc);
  const [url, setUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "commands">("preview");
  const preview = useQuery({
    queryKey: ["officecli.preview", workspaceId, file.path, revision],
    queryFn: () => rpc({ workspaceId, path: file.path }),
    enabled: supportsPreview && mode === "preview", retry: false, refetchOnWindowFocus: false,
  });
  const { refetch } = preview;
  useEffect(() => file.watch(() => { if (mode === "preview") void refetch(); }), [file, refetch, mode]);
  useEffect(() => {
    if (!supportsPreview || !preview.data) { setUrl(null); return; }
    const next = createPreviewUrl(preview.data.html);
    setUrl(next);
    return () => revokePreviewUrl(next);
  }, [preview.data]);
  const colors = theme.colors;
  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, backgroundColor: colors.surface0 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ flex: 1, minWidth: 160, color: colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{file.name}</Text>
        <ActionButton theme={theme} icon={mode === "preview" ? "Terminal" : "ArrowLeft"} label={mode === "preview" ? "高级命令" : "返回预览"} onPress={() => setMode(mode === "preview" ? "commands" : "preview")} />
        {mode === "preview" && <ActionButton theme={theme} icon="RefreshCw" label={preview.isFetching ? "刷新中" : "刷新预览"} disabled={preview.isFetching || !supportsPreview} onPress={() => { void refetch(); }} />}
      </View>
      {mode === "commands" ? <CommandConsole key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} theme={theme} layout={layout} path={file.path} />
        : !supportsPreview ? <Text style={{ padding: 20, color: colors.foreground }}>请在 Paseo 桌面端或浏览器打开 OfficeCLI 预览。手机原生客户端暂不支持。</Text>
        : preview.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{preview.error.message}</Text>
          : url ? <PreviewFrame url={url} name={file.name} /> : <Loading />}
    </View>
  );
}
