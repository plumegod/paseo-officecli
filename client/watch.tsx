import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { selectionPrepareRpc, watchCloseRpc, watchEventsRpc, watchOpenRpc, watchRequestRpc, watchSaveRpc } from "../shared/officecli";
import { bridgeMessage, MAX_SELECTION_PATHS, selectionUpdate, watchRequest, type WatchState } from "../shared/watch";
import { createPreviewUrl, PreviewFrame, revokePreviewUrl, type FrameHandle, type FrameWindow } from "./web";
import { watchBridge } from "./watch-bridge";
import { ActionButton } from "./controls";
import type { createSelectionSource } from "./selection";

interface FrameMessage { source: FrameWindow | null; data: unknown }
declare const window: {
  crypto: { randomUUID(): string };
  addEventListener(type: "message", listener: (event: FrameMessage) => void): void;
  removeEventListener(type: "message", listener: (event: FrameMessage) => void): void;
};

export type WatchChrome = { save(): void; reload(): void; label: string; disabled: boolean; error: string | null };

export function WatchEditor({ workspaceId, file, theme, onChrome, beginSelection }: Pick<PluginFilePanelProps, "workspaceId" | "file" | "theme"> & { onChrome: (chrome: WatchChrome | null) => void; beginSelection: ReturnType<typeof createSelectionSource>["begin"] }) {
  const open = useRpc(watchOpenRpc), request = useRpc(watchRequestRpc), events = useRpc(watchEventsRpc);
  const close = useRpc(watchCloseRpc), save = useRpc(watchSaveRpc), prepare = useRpc(selectionPrepareRpc);
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
  const [selection, setSelection] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(0);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    let alive = true, leaseId: string | null = null, blob: string | null = null, cursor = 0, inflight = 0, refreshing = false;
    const channel = window.crypto.randomUUID();
    setUrl(null); setState(null); setError(null); setFatal(false); setBusy(0); setSaving(false);
    setSelection([]); setSelecting(0); setPreparing(false);
    const show = (html: string) => {
      if (!alive) return;
      setSelection([]);
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
      let selectionRequest = false;
      inflight++;
      if (mutation) { setBusy((count) => count + 1); setError(null); }
      try {
        let value;
        if (message.kind === "events") {
          value = await api.current.events({ workspaceId, leaseId, after: message.after });
          cursor = value.cursor;
          if (alive) {
            update(value);
            for (const event of value.events) {
              const paths = selectionUpdate(event);
              if (paths !== null) setSelection(paths);
            }
          }
          if (value.reload) void refresh();
        } else {
          const input = watchRequest.parse(message.method === "GET"
            ? { route: message.route, method: message.method }
            : { route: message.route, method: message.method, body: JSON.parse(message.body) });
          if (input.route === "/api/selection") {
            selectionRequest = true; setSelection([]); setSelecting((count) => count + 1);
          }
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
      } finally {
        inflight--;
        if (alive && mutation) setBusy((count) => count - 1);
        if (alive && selectionRequest) setSelecting((count) => count - 1);
      }
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
  const saved = !!state && state.savedRevision !== null && state.savedRevision === state.revision;
  const persist = useRef({ save: async () => {}, reload: () => {} });
  persist.current.save = async () => {
    const leaseId = session.current;
    if (!leaseId) return;
    setSaving(true); setError(null);
    try { update(await save({ workspaceId, leaseId })); }
    catch (failure) { setError(String(failure)); }
    finally { setSaving(false); }
  };
  persist.current.reload = () => setRestart((value) => value + 1);
  useLayoutEffect(() => {
    onChrome({
      save: () => { void persist.current.save(); },
      reload: () => persist.current.reload(),
      label: saving ? "保存中" : busy ? "提交中" : saved ? "已保存" : "保存",
      disabled: !state || fatal || saving || busy > 0,
      error,
    });
  }, [onChrome, state, fatal, saving, busy, saved, error]);
  useEffect(() => () => onChrome(null), [onChrome]);
  const capture = async () => {
    const leaseId = session.current;
    if (!leaseId) return;
    const publish = beginSelection(workspaceId, file.name);
    setPreparing(true); setError(null);
    try {
      const result = await prepare({ workspaceId, leaseId, paths: selection });
      if (session.current === leaseId && !publish(result.token)) setError("其他窗口已引用选区，请再点一次。");
    } catch (failure) { if (session.current === leaseId) setError(String(failure)); }
    finally { if (session.current === leaseId) setPreparing(false); }
  };
  return <View style={{ flex: 1, minHeight: 0 }}>
    {/\.(docx|pptx)$/i.test(file.path) && !fatal && <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <ActionButton theme={theme} icon="Paperclip" label={preparing ? "引用中" : "引用选中区域"} disabled={!state || selecting > 0 || selection.length === 0 || selection.length > MAX_SELECTION_PATHS || preparing} onPress={() => { void capture(); }} />
        <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{selection.length > MAX_SELECTION_PATHS ? `最多选择 ${MAX_SELECTION_PATHS} 个对象` : "点击段落或对象后再引用。"}</Text>
      </View>
    </View>}
    {fatal ? <Text style={{ padding: 20, color: colors.foregroundMuted }}>交互连接不可用；只读预览和高级命令仍可使用。</Text>
      : url ? <PreviewFrame url={url} name={file.name} frameRef={frame} onLoad={() => {
        // OfficeCLI sometimes requests location.reload(); a Blob reload alone would serve stale HTML.
        if (lastLoaded.current === url) reload.current();
        lastLoaded.current = url;
      }} /> : <Loading />}
  </View>;
}
