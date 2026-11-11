import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { copyText, ExternalLink, Modal, ScrollView, SettingsSwitch, TextInput } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commandInputRpc, commandStartRpc, commandStateRpc, commandStopRpc, statusRpc } from "../shared/officecli";
import { MAX_INPUT_CHARS, parseArguments, type CommandSnapshot } from "../shared/commands";
import { ActionButton, Disclosure } from "./controls";

type Props = Pick<PluginFilePanelProps, "workspaceId" | "theme" | "layout"> & { path: string };

export function CommandConsole({ workspaceId, theme, layout, path }: Props) {
  const [argsText, setArgsText] = useState(() => JSON.stringify(["get", path, "/", "--json"], null, 2));
  const [input, setInput] = useState("");
  const [keepStdinOpen, setKeepStdinOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [stream, setStream] = useState<"stdout" | "stderr">("stdout");
  const [stdinExpanded, setStdinExpanded] = useState(false);
  const queryClient = useQueryClient();
  const stateRpc = useRpc(commandStateRpc);
  const startRpc = useRpc(commandStartRpc);
  const inputRpc = useRpc(commandInputRpc);
  const stopRpc = useRpc(commandStopRpc);
  const detect = useRpc(statusRpc);
  const queryKey = ["officecli.command", workspaceId];
  const state = useQuery({
    queryKey, queryFn: () => stateRpc({ workspaceId }), retry: false, refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.job?.status === "running" ? 1000 : false,
  });
  const recheck = useMutation({ mutationFn: () => detect({ refresh: true }), onSuccess: (status) => { queryClient.setQueryData(["officecli.status"], status); void state.refetch(); } });
  const update = (job: CommandSnapshot) => queryClient.setQueryData(queryKey, { ...state.data, directory: job.cwd, executable: job.executable, job });
  const start = useMutation({
    mutationFn: () => startRpc({ workspaceId, args: parseArguments(argsText), input, keepStdinOpen, confirmed: true }),
    onSuccess: (job) => { update(job); setInput(""); setStream("stdout"); setCopyError(""); send.reset(); stop.reset(); },
  });
  const send = useMutation({
    mutationFn: (eof: boolean) => inputRpc({ workspaceId, jobId: state.data!.job!.id, input, eof }),
    onSuccess: (job) => { update(job); setInput(""); },
  });
  const stop = useMutation({
    mutationFn: () => stopRpc({ workspaceId, jobId: state.data!.job!.id }), onSuccess: update,
  });
  const job = state.data?.job;
  const running = job?.status === "running";
  const busy = running || start.isPending;
  useEffect(() => {
    if (job && job.status !== "running") void queryClient.invalidateQueries({ queryKey: ["officecli.preview", workspaceId] });
  }, [job?.id, job?.status, queryClient, workspaceId]);
  useEffect(() => {
    if (running && job?.stdinOpen) setStdinExpanded(true);
  }, [job?.id, job?.stdinOpen, running]);

  let args: string[] | null = null;
  let parseError = "";
  try { args = parseArguments(argsText); }
  catch (error) { parseError = (error as Error).message; }
  const error = start.error?.message || send.error?.message || stop.error?.message || recheck.error?.message || state.error?.message || copyError;
  const installation = state.data?.installation;
  const blocked = installation?.compatibility === "upgrade-required";
  const canRun = !!args && !!state.data && !state.isError && !blocked && !busy;
  const colors = theme.colors;
  const text = { color: colors.foreground, fontSize: 13, lineHeight: 20 };
  const muted = { color: colors.foregroundMuted, fontSize: 12, lineHeight: 18 };
  const mono = { ...text, fontFamily: "monospace" };
  const inputStyle = { ...mono, backgroundColor: colors.surface1, borderColor: colors.border, borderWidth: 1, borderRadius: 6, padding: 12, minWidth: 0, width: "100%" as const };
  const preset = (value: string[], keepOpen = false) => {
    setArgsText(JSON.stringify(value, null, 2)); setInput(""); setKeepStdinOpen(keepOpen);
    setStdinExpanded(keepOpen || value[0] === "batch");
  };
  async function copy(value: string) {
    try { await copyText(value); setCopyError(""); }
    catch (caught) { setCopyError((caught as Error).message); }
  }
  const labels = { running: "运行中", completed: "已完成", failed: "执行失败", stopped: "已停止" };
  const tones = { running: colors.accent, completed: colors.statusSuccess, failed: colors.statusDanger, stopped: colors.statusWarning };

  return (
    <ScrollView style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, paddingBottom: 32 }}>
      <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: 16 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: "600" }}>高级命令</Text>
        <Text style={muted}>运行 OfficeCLI 命令。参数使用 JSON 字符串数组，每一项为一个参数；无需填写 officecli。</Text>
        <Text style={muted}>最低支持 OfficeCLI 1.0.160；较旧版本请升级至官方稳定版。后续版本需保持公开接口兼容，否则可能需要更新插件。</Text>
        {installation && <Text selectable accessibilityRole="alert" style={{ ...muted, color: blocked ? colors.statusDanger : colors.foregroundMuted }}>{installation.diagnostic}</Text>}
        {blocked && <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation" accessibilityLabel="OfficeCLI 官方安装与升级说明"><Text style={{ color: colors.accent }}>官方安装与升级</Text></ExternalLink>}
        {installation?.compatibility === "supported" && (["get", "batch", "mcp"] as const).map((key) => installation.capabilities[key].status !== "supported" && <Text key={key} selectable style={muted}>{installation.capabilities[key].diagnostic}</Text>)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ActionButton theme={theme} label="查看文档结构" hint={installation?.capabilities.get.diagnostic} disabled={busy || blocked || installation?.capabilities.get.status === "missing"} onPress={() => preset(["get", path, "/", "--json"])} />
          <ActionButton theme={theme} label="查看帮助" disabled={busy || blocked} onPress={() => preset(["help"])} />
          <ActionButton theme={theme} label="批处理" hint={installation?.capabilities.batch.diagnostic} disabled={busy || blocked || installation?.capabilities.batch.status === "missing"} onPress={() => preset(["batch", path])} />
          <ActionButton theme={theme} label="MCP" hint={installation?.capabilities.mcp.diagnostic} disabled={busy || blocked || installation?.capabilities.mcp.status === "missing"} onPress={() => preset(["mcp"], true)} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ ...text, fontWeight: "500" }}>命令参数</Text>
          <TextInput accessibilityLabel="OfficeCLI 命令参数" multiline editable={!busy} maxLength={MAX_INPUT_CHARS} value={argsText} onChangeText={setArgsText} style={{ ...inputStyle, minHeight: 140 }} />
          {parseError ? <Text selectable accessibilityRole="alert" style={{ ...text, color: colors.statusDanger }}>{parseError}</Text>
            : <Text style={muted}>例如 ["help"]；当前文件路径已填入“查看文档结构”。</Text>}
        </View>

        <Disclosure theme={theme} title="输入内容（批处理或交互命令）" summary={input ? "已填写" : undefined} open={stdinExpanded} onToggle={() => setStdinExpanded(!stdinExpanded)}>
          <Text style={muted}>此内容通过标准输入发送；普通命令通常无需填写。</Text>
          <TextInput accessibilityLabel="OfficeCLI 输入内容" multiline editable={!start.isPending && !send.isPending && (!running || !!job?.stdinOpen)} maxLength={MAX_INPUT_CHARS} value={input} onChangeText={setInput} style={{ ...inputStyle, minHeight: 110 }} />
          {!running && <SettingsSwitch label="保持输入打开" hint="用于需要继续发送输入的长任务。" value={keepStdinOpen} onValueChange={setKeepStdinOpen} disabled={busy} />}
          {running && job?.stdinOpen && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <ActionButton theme={theme} label={send.isPending ? "发送中" : "发送输入"} icon="Send" disabled={blocked || send.isPending || !input} onPress={() => send.mutate(false)} />
            <ActionButton theme={theme} label="结束输入（EOF）" disabled={blocked || send.isPending} onPress={() => send.mutate(true)} />
          </View>}
        </Disclosure>

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {running ? <ActionButton theme={theme} label={stop.isPending ? "停止中" : "停止命令"} disabled={stop.isPending} onPress={() => stop.mutate()} />
            : <ActionButton theme={theme} label={start.isPending ? "启动中" : "运行命令"} primary disabled={!canRun} onPress={() => setConfirmOpen(true)} />}
          <ActionButton theme={theme} label={recheck.isPending ? "检测中" : "重新检测"} disabled={recheck.isPending || busy} onPress={() => recheck.mutate()} />
          {state.isPending && <Text style={muted}>正在准备 OfficeCLI…</Text>}
          {state.isError && <ActionButton theme={theme} label="重试" onPress={() => { void state.refetch(); }} />}
        </View>
        {!!error && <Text selectable accessibilityRole="alert" style={{ ...text, color: colors.statusDanger }}>{error}</Text>}

        {job && <View style={{ gap: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 16 }}>
          <Text accessibilityLiveRegion="polite" style={{ ...text, color: tones[job.status] }}>
            {labels[job.status]}{job.exitCode !== null ? ` · 退出码 ${job.exitCode}` : ""}{job.signal ? ` · ${job.signal}` : ""}
          </Text>
          {!!job.error && <Text selectable accessibilityRole="alert" style={{ ...text, color: colors.statusDanger }}>{job.error}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["stdout", "stderr"] as const).map((value) => <ActionButton key={value} theme={theme} label={value === "stdout" ? "输出" : "错误输出"} selected={stream === value} onPress={() => setStream(value)} />)}
            <ActionButton theme={theme} label="复制完整输出" icon="Copy" onPress={() => { void copy(job[stream]); }} />
          </View>
          <ScrollView accessibilityLabel={`${stream} 命令输出`} style={{ maxHeight: 300, minHeight: 80, minWidth: 0 }}>
            <Text selectable style={mono}>{job[stream].slice(0, 200_000) || "（空）"}{job[stream].length > 200_000 ? "\n…界面仅展示前 200000 字符，可复制完整输出。" : ""}</Text>
          </ScrollView>
        </View>}
      </View>

      <Modal title="确认运行命令" open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Text style={text}>命令以宿主账户执行，可修改工作区外文件、访问网络或更改全局配置。请备份重要文件；执行失败（包括非零退出）、停止或超限终止不等于撤销，请检查文件状态。</Text>
            <Text selectable style={muted}>程序：{state.data?.executable}</Text>
            <Text selectable style={muted}>工作目录：{state.data?.directory}</Text>
            <Text selectable style={mono}>{args ? JSON.stringify(args, null, 2) : argsText}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <ActionButton theme={theme} label="取消" onPress={() => setConfirmOpen(false)} />
              <ActionButton theme={theme} label="确认运行" primary disabled={!canRun} onPress={() => { setConfirmOpen(false); start.mutate(); }} />
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </ScrollView>
  );
}
