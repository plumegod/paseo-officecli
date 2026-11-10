import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { copyText, SettingsSwitch, TextInput } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commandInputRpc, commandStartRpc, commandStateRpc, commandStopRpc } from "../shared/officecli";
import { MAX_INPUT_CHARS, parseArguments, type CommandSnapshot } from "../shared/commands";

type Props = Pick<PluginWorkspacePanelProps, "workspaceId" | "theme"> & { path?: string };

export function CommandConsole({ workspaceId, theme, path }: Props) {
  const [argsText, setArgsText] = useState(() => JSON.stringify(path ? ["get", path, "/", "--json"] : ["help"], null, 2));
  const [input, setInput] = useState("");
  const [keepStdinOpen, setKeepStdinOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [copyError, setCopyError] = useState("");
  const queryClient = useQueryClient();
  const stateRpc = useRpc(commandStateRpc);
  const startRpc = useRpc(commandStartRpc);
  const inputRpc = useRpc(commandInputRpc);
  const stopRpc = useRpc(commandStopRpc);
  const queryKey = ["officecli.command", workspaceId];
  const state = useQuery({
    queryKey, queryFn: () => stateRpc({ workspaceId }), retry: false, refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.job?.status === "running" ? 1000 : false,
  });
  const update = (job: CommandSnapshot) => queryClient.setQueryData(queryKey, { directory: job.cwd, executable: job.executable, job });
  const start = useMutation({
    mutationFn: () => startRpc({ workspaceId, args: parseArguments(argsText), input, keepStdinOpen, confirmed: true }),
    onSuccess: (job) => { update(job); setInput(""); setConfirmed(false); },
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

  let args: string[] | null = null;
  let parseError = "";
  try { args = parseArguments(argsText); }
  catch (error) { parseError = (error as Error).message; }
  const changeArgs = (text: string) => { setArgsText(text); setConfirmed(false); };
  const error = parseError || start.error?.message || send.error?.message || stop.error?.message || state.error?.message || copyError;
  const textStyle = { color: theme.colors.foreground, fontSize: 13 };
  const inputStyle = { ...textStyle, backgroundColor: theme.colors.surface1, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 6, padding: 10, fontFamily: "monospace", minWidth: 0, width: "100%" as const };
  const buttonStyle = { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 6, backgroundColor: theme.colors.surface2 };
  const preset = (value: string[]) => { changeArgs(JSON.stringify(value, null, 2)); setInput(""); setKeepStdinOpen(false); };
  async function copy(text: string) {
    try { await copyText(text); setCopyError(""); }
    catch (error) { setCopyError((error as Error).message); }
  }

  return (
    <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ padding: 14, gap: 12 }}>
      <Text style={{ ...textStyle, fontSize: 18, fontWeight: "600" }}>OfficeCLI 命令工作台</Text>
      <Text style={textStyle}>直接运行当前安装的官方 OfficeCLI：创建、读取、分析、修改、重组及新增命令统一支持，不设命令白名单。参数填写 JSON 字符串数组，不填写 officecli 前缀；不会经过 shell。</Text>
      <Text selectable style={{ ...textStyle, fontFamily: "monospace" }}>程序：{state.data?.executable || "检查中…"}{"\n"}工作目录：{state.data?.directory || "检查中…"}</Text>
      {path && <Text selectable style={textStyle}>当前文件：{path}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable accessibilityRole="button" disabled={busy} style={buttonStyle} onPress={() => preset(["help"])}><Text style={textStyle}>当前版本帮助</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={buttonStyle} onPress={() => preset(["help", "all", "--json"])}><Text style={textStyle}>完整能力 JSON</Text></Pressable>
        {path && <Pressable accessibilityRole="button" disabled={busy} style={buttonStyle} onPress={() => preset(["get", path, "/", "--json"])}><Text style={textStyle}>当前文档结构</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} style={buttonStyle} onPress={() => preset(["create", "new.docx"])}><Text style={textStyle}>创建文档示例</Text></Pressable>
      </View>
      <Text style={textStyle}>argv（逐项原样传递，路径中的空格无需额外 shell 引号）</Text>
      <TextInput accessibilityLabel="OfficeCLI 参数 JSON" multiline editable={!busy} maxLength={MAX_INPUT_CHARS} value={argsText} onChangeText={changeArgs} style={{ ...inputStyle, minHeight: 110 }} />
      <Text selectable style={{ ...textStyle, fontFamily: "monospace" }}>即将执行 argv：{args ? JSON.stringify(args) : "参数无效"}</Text>
      <Text style={textStyle}>标准输入（batch 可直接粘贴官方 JSON；MCP 等逐行协议请自行保留换行）</Text>
      <TextInput accessibilityLabel="OfficeCLI 标准输入" multiline editable={!start.isPending && !send.isPending && (!running || !!job?.stdinOpen)} maxLength={MAX_INPUT_CHARS} value={input} onChangeText={(value) => { setInput(value); setConfirmed(false); }} style={{ ...inputStyle, minHeight: 85 }} />
      <SettingsSwitch label="执行后保持标准输入打开" hint="普通命令默认发送上述输入后关闭；MCP/交互命令可保持打开，再发送输入或 EOF。" value={keepStdinOpen} onValueChange={(value) => { setKeepStdinOpen(value); setConfirmed(false); }} disabled={busy} />
      <SettingsSwitch label="我确认以宿主账户执行此命令" hint="这不是文件系统沙箱。命令可以修改/删除工作区外文件或全局配置；请备份重要文件。停止不等于撤销。" value={confirmed} onValueChange={setConfirmed} disabled={busy} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !confirmed || !args || !state.data || busy }} disabled={!confirmed || !args || !state.data || busy} style={[buttonStyle, { opacity: !confirmed || !args || !state.data || busy ? 0.5 : 1 }]} onPress={() => start.mutate()}><Text style={textStyle}>{start.isPending ? "正在启动…" : "执行官方命令"}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!running || stop.isPending} style={buttonStyle} onPress={() => stop.mutate()}><Text style={textStyle}>停止当前进程</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={state.isFetching} style={buttonStyle} onPress={() => { void state.refetch(); }}><Text style={textStyle}>刷新状态</Text></Pressable>
        {running && job?.stdinOpen && <>
          <Pressable accessibilityRole="button" disabled={send.isPending || !input} style={buttonStyle} onPress={() => send.mutate(false)}><Text style={textStyle}>发送输入</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={send.isPending} style={buttonStyle} onPress={() => send.mutate(true)}><Text style={textStyle}>发送并关闭输入</Text></Pressable>
        </>}
      </View>
      {!!error && <Text selectable accessibilityRole="alert" style={{ ...textStyle, color: theme.colors.statusDanger }}>{error}</Text>}
      {job && <>
        <Text selectable style={{ ...textStyle, fontWeight: "600" }}>状态：{job.status} · exitCode：{job.exitCode ?? "—"} · signal：{job.signal || "—"} · stdin：{job.stdinOpen ? "open" : "closed"}</Text>
        <Text selectable style={{ ...textStyle, fontFamily: "monospace" }}>实际命令：{job.executable} {JSON.stringify(job.args)}{"\n"}cwd：{job.cwd}</Text>
        {!!job.error && <Text selectable style={{ ...textStyle, color: theme.colors.statusDanger }}>{job.error}</Text>}
        {(["stdout", "stderr"] as const).map((stream) => <View key={stream} style={{ gap: 6 }}>
          <Pressable accessibilityRole="button" style={buttonStyle} onPress={() => { void copy(job[stream]); }}><Text style={textStyle}>复制完整 {stream}（{job[stream].length} 字符）</Text></Pressable>
          <Text selectable style={{ ...textStyle, fontFamily: "monospace", backgroundColor: theme.colors.surface1, padding: 10 }}>{job[stream].slice(0, 200_000) || "（空）"}{job[stream].length > 200_000 ? "\n…界面仅展示前 200000 字符，可复制完整输出。" : ""}</Text>
        </View>)}
      </>}
      <Text style={{ ...textStyle, color: theme.colors.foregroundMuted }}>每工作区保留最近一条任务，运行中不能覆盖；最多保留 8 个工作区任务。输出上限 16 MiB，超限会停止，不自动重试。命令无 60 秒超时。重载/禁用插件会停止它启动的前台进程，不关闭官方自行启动的常驻/预览服务；请用官方 close / unwatch 管理。完成后刷新文档预览；需要向磁盘提交内存修改时请执行官方 save，官方 resident 的自动保存行为保持不变，插件不追加保存或覆盖参数。</Text>
    </ScrollView>
  );
}

export function CommandWorkspacePanel(props: PluginWorkspacePanelProps) {
  return <CommandConsole key={props.workspaceId} workspaceId={props.workspaceId} theme={props.theme} />;
}
