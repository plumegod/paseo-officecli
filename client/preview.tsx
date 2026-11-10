import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { previewRpc } from "../shared/officecli";
import { createPreviewUrl, PreviewFrame, revokePreviewUrl, supportsPreview } from "./web";
import { CommandConsole } from "./commands";
import { WatchEditor, type WatchChrome } from "./watch";

export function OfficePreview({ workspaceId, file, revision, theme }: PluginFilePanelProps) {
  const rpc = useRpc(previewRpc);
  const [url, setUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "watch" | "commands">("preview");
  const [chrome, setChrome] = useState<WatchChrome | null>(null);
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
        {(["preview", "watch", "commands"] as const).map((next) => {
          const label = next === "preview" ? "只读预览" : next === "watch" ? /\.xlsx$/i.test(file.path) ? "交互编辑" : "实时预览/选择" : "命令工作台";
          const hint = next === "watch" ? /\.xlsx$/i.test(file.path) ? "双击单元格编辑，拖动图表" : "实时预览和选择，不能原位编辑文本" : undefined;
          return <Pressable key={next} accessibilityRole="button" accessibilityLabel={hint ? `${label}：${hint}` : label} accessibilityState={{ selected: mode === next }} onPress={() => setMode(next)} style={{ padding: 8 }}>
            <Text style={{ color: mode === next ? colors.foreground : colors.accent }}>{label}</Text>
          </Pressable>;
        })}
        {mode === "preview" && <Pressable accessibilityRole="button" accessibilityLabel="Refresh OfficeCLI preview" disabled={preview.isFetching || !supportsPreview} onPress={() => { void refetch(); }} style={{ padding: 8, opacity: preview.isFetching ? 0.5 : 1 }}>
          <Text style={{ color: colors.accent }}>{preview.isFetching ? "正在渲染…" : "刷新"}</Text>
        </Pressable>}
        {mode === "watch" && chrome ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="保存到磁盘，调用官方 save，不关闭 resident" disabled={chrome.disabled} onPress={chrome.save} style={{ padding: 8 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: colors.accent }}>{chrome.label}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="重新打开官方页面" onPress={chrome.reload} style={{ padding: 8 }}>
            <Text style={{ color: colors.accent }}>重载</Text>
          </Pressable>
          {chrome.error ? <Text accessibilityRole="alert" selectable numberOfLines={1} style={{ flex: 1, color: colors.statusDanger }}>{chrome.error}</Text> : null}
        </> : null}
      </View>
      {mode === "commands" ? <CommandConsole key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} theme={theme} path={file.path} />
        : !supportsPreview ? <Text style={{ padding: 20, color: colors.foreground }}>请在 Paseo 桌面端或浏览器打开 OfficeCLI 预览。手机原生客户端暂不支持。</Text>
        : mode === "watch" ? <WatchEditor key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} file={file} theme={theme} onChrome={setChrome} />
        : preview.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{preview.error.message}</Text>
          : url ? <PreviewFrame url={url} name={file.name} /> : <Loading />}
    </View>
  );
}
