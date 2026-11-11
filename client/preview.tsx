import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { ExternalLink, Loading } from "@getpaseo/plugin/client/ui";
import { previewRpc, statusRpc } from "../shared/officecli";
import { createPreviewUrl, PreviewFrame, revokePreviewUrl, supportsPreview } from "./web";
import { CommandConsole } from "./commands";
import { WatchEditor, type WatchChrome } from "./watch";
import { ActionButton } from "./controls";

export function OfficePreview({ workspaceId, file, revision, theme, layout }: PluginFilePanelProps) {
  const rpc = useRpc(previewRpc);
  const detect = useRpc(statusRpc);
  const queryClient = useQueryClient();
  const installation = useQuery({ queryKey: ["officecli.status"], queryFn: () => detect({}), retry: false, refetchOnWindowFocus: false });
  const status = installation.data;
  const blocked = status?.compatibility !== "supported" || status.capabilities.htmlPreview.status === "missing";
  const diagnostic = status?.compatibility !== "supported" ? status?.diagnostic : status.capabilities.htmlPreview.diagnostic;
  const [url, setUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "watch" | "commands">("preview");
  const [chrome, setChrome] = useState<WatchChrome | null>(null);
  const preview = useQuery({
    queryKey: ["officecli.preview", workspaceId, file.path, revision],
    queryFn: () => rpc({ workspaceId, path: file.path }),
    enabled: supportsPreview && mode === "preview" && !blocked && !installation.isError, retry: false, refetchOnWindowFocus: false,
  });
  const { refetch } = preview;
  const recheck = useMutation({
    mutationFn: () => detect({ refresh: true }),
    onSuccess: (next) => {
      queryClient.setQueryData(["officecli.status"], next);
      if (next.compatibility === "supported" && next.capabilities.htmlPreview.status !== "missing") void refetch();
    },
  });
  useEffect(() => file.watch(() => { if (mode === "preview" && !blocked && !installation.isError) void refetch(); }), [file, refetch, mode, blocked, installation.isError]);
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
        {mode === "preview" && supportsPreview && <ActionButton theme={theme} icon="Pencil" label={/\.xlsx$/i.test(file.path) ? "交互编辑" : "实时预览/选择"} hint={/\.xlsx$/i.test(file.path) ? "双击单元格编辑，拖动图表" : "实时预览和选择，不能原位编辑文本"} disabled={status?.compatibility !== "supported" || installation.isError} onPress={() => setMode("watch")} />}
        <ActionButton theme={theme} icon={mode === "commands" ? "ArrowLeft" : "Terminal"} label={mode === "commands" ? "返回预览" : "高级命令"} onPress={() => setMode(mode === "commands" ? "preview" : "commands")} />
        {mode === "watch" && <ActionButton theme={theme} icon="ArrowLeft" label="返回预览" onPress={() => setMode("preview")} />}
        {mode === "preview" && <ActionButton theme={theme} icon="RefreshCw" label={preview.isFetching || recheck.isPending || installation.isFetching ? "刷新中" : "刷新预览"} disabled={preview.isFetching || recheck.isPending || installation.isFetching || !supportsPreview} onPress={() => recheck.mutate()} />}
        {mode === "watch" && chrome ? <>
          <View accessibilityLiveRegion="polite"><ActionButton theme={theme} icon="Save" label={chrome.label} hint={status?.capabilities.save.status === "missing" ? status.capabilities.save.diagnostic : "调用官方 save，不关闭 resident"} disabled={chrome.disabled || status?.compatibility !== "supported" || installation.isError || status.capabilities.save.status === "missing"} onPress={chrome.save} /></View>
          <ActionButton theme={theme} icon="RefreshCw" label="重载" hint="重新打开官方页面" onPress={chrome.reload} />
          {(chrome.error || status?.capabilities.save.status === "missing") && <Text accessibilityRole="alert" selectable numberOfLines={1} style={{ flex: 1, color: colors.statusDanger }}>{chrome.error || status?.capabilities.save.diagnostic}</Text>}
        </> : null}
      </View>
      {mode === "preview" && status?.compatibility === "supported" && status.capabilities.htmlPreview.status === "unknown" && <Text selectable accessibilityRole="alert" style={{ padding: 12, color: colors.statusWarning }}>{diagnostic}</Text>}
      {mode === "preview" && status?.compatibility === "upgrade-required" && <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation" accessibilityLabel="OfficeCLI 官方安装与升级说明"><Text style={{ padding: 12, color: colors.accent }}>官方安装与升级</Text></ExternalLink>}
      {mode === "commands" ? <CommandConsole key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} theme={theme} layout={layout} path={file.path} />
        : !supportsPreview ? <Text style={{ padding: 20, color: colors.foreground }}>请在 Paseo 桌面端或浏览器打开 OfficeCLI 预览。手机原生客户端暂不支持。</Text>
        : mode === "watch" ? <WatchEditor key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} file={file} theme={theme} onChrome={setChrome} />
        : installation.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{installation.error.message}</Text>
        : installation.isPending ? <Loading />
        : blocked ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{diagnostic}</Text>
        : preview.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{preview.error.message}</Text>
          : url ? <PreviewFrame url={url} name={file.name} /> : <Loading />}
    </View>
  );
}
