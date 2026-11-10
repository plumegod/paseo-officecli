import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { previewRpc } from "../shared/officecli";
import { createPreviewUrl, PreviewFrame, revokePreviewUrl, supportsPreview } from "./web";

export function OfficePreview({ workspaceId, file, revision, theme }: PluginFilePanelProps) {
  const rpc = useRpc(previewRpc);
  const [url, setUrl] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["officecli.preview", workspaceId, file.path, revision],
    queryFn: () => rpc({ workspaceId, path: file.path }),
    enabled: supportsPreview, retry: false, refetchOnWindowFocus: false,
  });
  const { refetch } = preview;
  useEffect(() => file.watch(() => { void refetch(); }), [file, refetch]);
  useEffect(() => {
    if (!supportsPreview || !preview.data) { setUrl(null); return; }
    const next = createPreviewUrl(preview.data.html);
    setUrl(next);
    return () => revokePreviewUrl(next);
  }, [preview.data]);
  const colors = theme.colors;
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.surface0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ flex: 1, color: colors.foreground }} numberOfLines={1}>OfficeCLI · {file.name} · 只读预览</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh OfficeCLI preview" disabled={preview.isFetching || !supportsPreview} onPress={() => { void refetch(); }} style={{ padding: 8, opacity: preview.isFetching ? 0.5 : 1 }}>
          <Text style={{ color: colors.accent }}>{preview.isFetching ? "正在渲染…" : "刷新"}</Text>
        </Pressable>
      </View>
      {!supportsPreview ? <Text style={{ padding: 20, color: colors.foreground }}>请在 Paseo 桌面端或浏览器打开 OfficeCLI 预览。手机原生客户端暂不支持。</Text>
        : preview.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{preview.error.message}</Text>
          : url ? <PreviewFrame url={url} name={file.name} /> : <Loading />}
    </View>
  );
}
