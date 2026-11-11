import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { watchCloseRpc, watchEventsRpc, watchOpenRpc, watchRequestRpc, watchSaveRpc } from "../shared/officecli";
import { bridgeMessage, watchRequest, type WatchState } from "../shared/watch";
import { createPreviewUrl, PreviewFrame, revokePreviewUrl, type FrameHandle, type FrameWindow } from "./web";
import { watchBridge } from "./watch-bridge";

interface FrameMessage { source: FrameWindow | null; data: unknown }
declare const window: {
  crypto: { randomUUID(): string };
  addEventListener(type: "message", listener: (event: FrameMessage) => void): void;
  removeEventListener(type: "message", listener: (event: FrameMessage) => void): void;
};

export function WatchEditor({ workspaceId, file, theme }: Pick<PluginFilePanelProps, "workspaceId" | "file" | "theme">) {
  const open = useRpc(watchOpenRpc), request = useRpc(watchRequestRpc), events = useRpc(watchEventsRpc);
  const close = useRpc(watchCloseRpc), save = useRpc(watchSaveRpc);
  const api = useRef({ open, request, events, close, save });
  api.current = { open, request, events, close, save };
  const frame = useRef<FrameHandle>(null);
  const session = useRef<string | null>(null);
  const closing = useRef<Promise<unknown>>(Promise.resolve());
  const reload = useRef<() => void>(() => {});
  const [restart, setRestart] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<WatchState | null>(null);
  const update = (next: WatchState) => setState((previous) => !previous || next.revision >= previous.revision ? next : previous);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true, leaseId: string | null = null, blob: string | null = null, cursor = 0, inflight = 0, refreshing = false;
    const channel = window.crypto.randomUUID();
    setUrl(null); setState(null); setError(null); setFatal(false); setBusy(0); setSaving(false);
    const show = (html: string) => {
      if (!alive) return;
      const next = createPreviewUrl(html, watchBridge(channel, cursor));
      if (blob) revokePreviewUrl(blob);
      blob = next; setUrl(next);
    };
    const refresh = async () => {
      if (!leaseId || refreshing || !alive) return;
      refreshing = true;
      try { show((await api.current.request({ workspaceId, leaseId, request: { route: "/", method: "GET" } })).body); }
      catch (failure) { if (alive) { setError(String(failure)); setFatal(true); } }
      finally { refreshing = false; }
    };
    reload.current = () => { void refresh(); };
    const receive = async (event: FrameMessage) => {
      if (!alive || !leaseId || event.source !== frame.current?.contentWindow) return;
      const parsed = bridgeMessage.safeParse(event.data);
      if (!parsed.success || parsed.data.channel !== channel || inflight >= 8) return;
      const message = parsed.data;
      const mutation = message.kind === "request" && message.route === "/api/send";
      inflight++;
      if (mutation) { setBusy((count) => count + 1); setError(null); }
      try {
        let value;
        if (message.kind === "events") {
          value = await api.current.events({ workspaceId, leaseId, after: message.after });
          cursor = value.cursor;
          if (alive) update(value);
          if (value.reload) void refresh();
        } else {
          const input = watchRequest.parse(message.method === "GET"
            ? { route: message.route, method: message.method }
            : { route: message.route, method: message.method, body: JSON.parse(message.body) });
          value = await api.current.request({ workspaceId, leaseId, request: input });
          if (alive && mutation) update(value);
        }
        if (alive) event.source?.postMessage({ channel, id: message.id, value }, "*");
      } catch (failure) {
        if (alive) {
          const detail = failure instanceof Error ? failure.message : String(failure);
          setError(detail);
          if (message.kind === "events") setFatal(true);
          event.source?.postMessage({ channel, id: message.id, error: detail }, "*");
        }
      } finally { inflight--; if (alive && mutation) setBusy((count) => count - 1); }
    };
    window.addEventListener("message", receive);
    void closing.current.then(() => api.current.open({ workspaceId, path: file.path })).then(async (opened) => {
      leaseId = opened.leaseId;
      if (!alive) { await api.current.close({ workspaceId, leaseId }); return; }
      session.current = leaseId; cursor = opened.cursor; update(opened); show(opened.html);
    }).catch((failure) => { if (alive) { setError(String(failure)); setFatal(true); } });
    return () => {
      alive = false; session.current = null;
      window.removeEventListener("message", receive);
      if (blob) revokePreviewUrl(blob);
      if (leaseId) closing.current = api.current.close({ workspaceId, leaseId }).catch(() => {}); // Lease expiry also cleans up a disconnected client.
    };
  }, [workspaceId, file.path, restart]);
  const lastLoaded = useRef<string | null>(null);
  const colors = theme.colors;
  const xlsx = /\.xlsx$/i.test(file.path);
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={{ padding: 12, gap: 8, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.foreground }}>
        {xlsx ? "官方 watch：双击单元格编辑，拖动图表调整位置。" : "官方 watch：实时预览和元素选择；此版本不支持 Word/PPTX 原位文本编辑，请使用高级命令。"}
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.foregroundMuted }}>
        {saving ? "正在请求官方 save…" : busy ? "正在向官方提交修改，尚未确认成功…"
          : state && state.savedRevision !== null && state.savedRevision === state.revision ? "本次插件修改已通过官方 save 确认落盘（不包含之后的外部修改）。"
          : `${state?.lastWrite === "applied" ? "官方已应用修改；" : state?.lastWrite === "unconfirmed" ? "修改结果未确认；" : ""}落盘未确认；官方自动保存策略不变。点击保存可确认，不会关闭 resident。`}
      </Text>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <Pressable accessibilityRole="button" disabled={!state || fatal || saving || busy > 0} onPress={async () => {
          const leaseId = session.current;
          if (!leaseId) return;
          setSaving(true); setError(null);
          try { update(await save({ workspaceId, leaseId })); }
          catch (failure) { setError(String(failure)); }
          finally { setSaving(false); }
        }} style={{ padding: 8 }}><Text style={{ color: colors.accent }}>保存到磁盘</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setRestart((value) => value + 1)} style={{ padding: 8 }}>
          <Text style={{ color: colors.accent }}>重新打开官方页面</Text>
        </Pressable>
      </View>
      {error && <Text accessibilityRole="alert" selectable style={{ color: colors.statusDanger }}>操作失败或结果未确认：{error}。不要盲目重试；可切回只读预览或高级命令检查。</Text>}
    </View>
    {fatal ? <Text style={{ padding: 20, color: colors.foregroundMuted }}>交互连接不可用；只读预览和高级命令仍可使用。</Text>
      : url ? <PreviewFrame url={url} name={file.name} frameRef={frame} onLoad={() => {
        // OfficeCLI sometimes requests location.reload(); a Blob reload alone would serve stale HTML.
        if (lastLoaded.current === url) reload.current();
        lastLoaded.current = url;
      }} /> : <Loading />}
  </View>;
}
