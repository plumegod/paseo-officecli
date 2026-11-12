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
import type { createSelectionSource } from "./selection";
import { useOfficeTranslation } from "./i18n";
import { documentType } from "./mode-store";
import { useDocumentModes } from "./modes";

export function OfficePreview({ workspaceId, file, revision, theme, layout, beginSelection }: PluginFilePanelProps & { beginSelection: ReturnType<typeof createSelectionSource>["begin"] }) {
  const { t, display } = useOfficeTranslation();
  const { modes, setMode, storageError } = useDocumentModes();
  const type = documentType(file.path);
  const mode = type ? modes[type] : "preview";
  const [commandsOpen, setCommandsOpen] = useState(false);
  const rpc = useRpc(previewRpc);
  const detect = useRpc(statusRpc);
  const queryClient = useQueryClient();
  const installation = useQuery({ queryKey: ["officecli.status"], queryFn: () => detect({}), retry: false, refetchOnWindowFocus: false });
  const status = installation.data;
  const blocked = status?.compatibility !== "supported" || (mode === "preview" && status.capabilities.htmlPreview.status === "missing");
  const diagnostic = status?.compatibility !== "supported" ? status?.diagnostic : status.capabilities.htmlPreview.diagnostic;
  const [url, setUrl] = useState<string | null>(null);
  const [chrome, setChrome] = useState<WatchChrome | null>(null);
  const preview = useQuery({
    queryKey: ["officecli.preview", workspaceId, file.path, revision],
    queryFn: () => rpc({ workspaceId, path: file.path }),
    enabled: supportsPreview && !commandsOpen && mode === "preview" && !blocked && !installation.isError, retry: false, refetchOnWindowFocus: false,
  });
  const { refetch } = preview;
  const recheck = useMutation({
    mutationFn: () => detect({ refresh: true }),
    onSuccess: (next) => {
      queryClient.setQueryData(["officecli.status"], next);
      if (!commandsOpen && mode === "preview" && next.compatibility === "supported" && next.capabilities.htmlPreview.status !== "missing") void refetch();
    },
  });
  useEffect(() => file.watch(() => { if (!commandsOpen && mode === "preview" && !blocked && !installation.isError) void refetch(); }), [file, refetch, mode, commandsOpen, blocked, installation.isError]);
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
        {!commandsOpen && supportsPreview && type && <ActionButton theme={theme} icon={mode === "watch" ? "BookOpen" : "Pencil"} label={mode === "watch" ? t("readingMode") : type === "xlsx" ? t("editingMode") : t("selectionMode")} hint={mode === "watch" ? t("readingModeHint") : type === "xlsx" ? t("spreadsheetHint") : t("selectionHint")} disabled={mode === "preview" && (status?.compatibility !== "supported" || installation.isError)} onPress={() => setMode(type, mode === "watch" ? "preview" : "watch")} />}
        <ActionButton theme={theme} icon={commandsOpen ? "ArrowLeft" : "Terminal"} label={commandsOpen ? t("backDocument") : t("advanced")} onPress={() => setCommandsOpen(!commandsOpen)} />
        {!commandsOpen && mode === "preview" && <ActionButton theme={theme} icon="RefreshCw" label={preview.isFetching || recheck.isPending || installation.isFetching ? t("refreshing") : t("refreshPreview")} disabled={preview.isFetching || recheck.isPending || installation.isFetching || !supportsPreview} onPress={() => recheck.mutate()} />}
        {!commandsOpen && mode === "watch" && chrome ? <>
          <View accessibilityLiveRegion="polite"><ActionButton theme={theme} icon="Save" label={chrome.label} hint={status?.capabilities.save.status === "missing" ? display(status.capabilities.save.diagnostic) : t("saveHint")} disabled={chrome.disabled || status?.compatibility !== "supported" || installation.isError || status.capabilities.save.status === "missing"} onPress={chrome.save} /></View>
          <ActionButton theme={theme} icon="RefreshCw" label={t("reload")} hint={t("reloadHint")} onPress={chrome.reload} />
          {(chrome.error || status?.capabilities.save.status === "missing") && <Text accessibilityRole="alert" selectable numberOfLines={1} style={{ flex: 1, color: colors.statusDanger }}>{display(chrome.error || status?.capabilities.save.diagnostic)}</Text>}
        </> : null}
      </View>
      {storageError && <Text accessibilityRole="alert" style={{ padding: 12, color: colors.statusWarning }}>{t("modeStorageUnavailable")}</Text>}
      {!commandsOpen && mode === "preview" && status?.compatibility === "supported" && status.capabilities.htmlPreview.status === "unknown" && <Text selectable accessibilityRole="alert" style={{ padding: 12, color: colors.statusWarning }}>{display(diagnostic)}</Text>}
      {!commandsOpen && status?.compatibility === "upgrade-required" && <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation" accessibilityLabel={t("officialInstallLabel")}><Text style={{ padding: 12, color: colors.accent }}>{t("officialInstall")}</Text></ExternalLink>}
      {commandsOpen ? <CommandConsole key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} theme={theme} layout={layout} path={file.path} />
        : !supportsPreview ? <Text style={{ padding: 20, color: colors.foreground }}>{t("previewPlatform")}</Text>
        : installation.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{display(installation.error)}</Text>
        : installation.isPending ? <Loading />
        : blocked ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{display(diagnostic)}</Text>
        : mode === "watch" ? <WatchEditor key={`${workspaceId}:${file.path}`} workspaceId={workspaceId} file={file} theme={theme} onChrome={setChrome} beginSelection={beginSelection} />
        : preview.isError ? <Text accessibilityRole="alert" selectable style={{ padding: 20, color: colors.statusDanger }}>{display(preview.error)}</Text>
          : url ? <PreviewFrame url={url} name={file.name} /> : <Loading />}
    </View>
  );
}
