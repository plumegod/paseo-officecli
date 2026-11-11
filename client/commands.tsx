import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { copyText, ExternalLink, Modal, ScrollView, SettingsSwitch, TextInput } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commandInputRpc, commandStartRpc, commandStateRpc, commandStopRpc, statusRpc } from "../shared/officecli";
import { MAX_INPUT_CHARS, parseArguments, type CommandSnapshot } from "../shared/commands";
import { ActionButton, Disclosure } from "./controls";
import { useOfficeTranslation } from "./i18n";

type Props = Pick<PluginFilePanelProps, "workspaceId" | "theme" | "layout"> & { path: string };

export function CommandConsole({ workspaceId, theme, layout, path }: Props) {
  const { t, display } = useOfficeTranslation();
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
  const labels = { running: t("running"), completed: t("completed"), failed: t("failed"), stopped: t("stopped") };
  const tones = { running: colors.accent, completed: colors.statusSuccess, failed: colors.statusDanger, stopped: colors.statusWarning };

  return (
    <ScrollView style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, paddingBottom: 32 }}>
      <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: 16 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: "600" }}>{t("advanced")}</Text>
        <Text style={muted}>{t("commandIntro")}</Text>
        <Text style={muted}>{t("supportPolicy")}</Text>
        {installation && <Text selectable accessibilityRole="alert" style={{ ...muted, color: blocked ? colors.statusDanger : colors.foregroundMuted }}>{display(installation.diagnostic)}</Text>}
        {blocked && <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation" accessibilityLabel={t("officialInstallLabel")}><Text style={{ color: colors.accent }}>{t("officialInstall")}</Text></ExternalLink>}
        {installation?.compatibility === "supported" && (["get", "batch", "mcp"] as const).map((key) => installation.capabilities[key].status !== "supported" && <Text key={key} selectable style={muted}>{display(installation.capabilities[key].diagnostic)}</Text>)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ActionButton theme={theme} label={t("viewStructure")} hint={display(installation?.capabilities.get.diagnostic)} disabled={busy || blocked || installation?.capabilities.get.status === "missing"} onPress={() => preset(["get", path, "/", "--json"])} />
          <ActionButton theme={theme} label={t("viewHelp")} disabled={busy || blocked} onPress={() => preset(["help"])} />
          <ActionButton theme={theme} label={t("batch")} hint={display(installation?.capabilities.batch.diagnostic)} disabled={busy || blocked || installation?.capabilities.batch.status === "missing"} onPress={() => preset(["batch", path])} />
          <ActionButton theme={theme} label={t("mcp")} hint={display(installation?.capabilities.mcp.diagnostic)} disabled={busy || blocked || installation?.capabilities.mcp.status === "missing"} onPress={() => preset(["mcp"], true)} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ ...text, fontWeight: "500" }}>{t("commandArgs")}</Text>
          <TextInput accessibilityLabel={t("commandArgsLabel")} multiline editable={!busy} maxLength={MAX_INPUT_CHARS} value={argsText} onChangeText={setArgsText} style={{ ...inputStyle, minHeight: 140 }} />
          {parseError ? <Text selectable accessibilityRole="alert" style={{ ...text, color: colors.statusDanger }}>{display(parseError)}</Text>
            : <Text style={muted}>{t("argsExample")}</Text>}
        </View>

        <Disclosure theme={theme} title={t("inputTitle")} summary={input ? t("filled") : undefined} open={stdinExpanded} onToggle={() => setStdinExpanded(!stdinExpanded)}>
          <Text style={muted}>{t("inputHint")}</Text>
          <TextInput accessibilityLabel={t("inputLabel")} multiline editable={!start.isPending && !send.isPending && (!running || !!job?.stdinOpen)} maxLength={MAX_INPUT_CHARS} value={input} onChangeText={setInput} style={{ ...inputStyle, minHeight: 110 }} />
          {!running && <SettingsSwitch label={t("keepInput")} hint={t("keepInputHint")} value={keepStdinOpen} onValueChange={setKeepStdinOpen} disabled={busy} />}
          {running && job?.stdinOpen && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <ActionButton theme={theme} label={send.isPending ? t("sending") : t("sendInput")} icon="Send" disabled={blocked || send.isPending || !input} onPress={() => send.mutate(false)} />
            <ActionButton theme={theme} label={t("endInput")} disabled={blocked || send.isPending} onPress={() => send.mutate(true)} />
          </View>}
        </Disclosure>

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {running ? <ActionButton theme={theme} label={stop.isPending ? t("stopping") : t("stopCommand")} disabled={stop.isPending} onPress={() => stop.mutate()} />
            : <ActionButton theme={theme} label={start.isPending ? t("starting") : t("runCommand")} primary disabled={!canRun} onPress={() => setConfirmOpen(true)} />}
          <ActionButton theme={theme} label={recheck.isPending ? t("detecting") : t("recheck")} disabled={recheck.isPending || busy} onPress={() => recheck.mutate()} />
          {state.isPending && <Text style={muted}>{t("preparing")}</Text>}
          {state.isError && <ActionButton theme={theme} label={t("retry")} onPress={() => { void state.refetch(); }} />}
        </View>
        {!!error && <Text selectable accessibilityRole="alert" style={{ ...text, color: colors.statusDanger }}>{display(error)}</Text>}

        {job && <View style={{ gap: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 16 }}>
          <Text accessibilityLiveRegion="polite" style={{ ...text, color: tones[job.status] }}>
            {labels[job.status]}{job.exitCode !== null ? t("exitCode", { code: job.exitCode }) : ""}{job.signal ? ` · ${job.signal}` : ""}
          </Text>
          {!!job.error && <Text selectable accessibilityRole="alert" style={{ ...text, color: colors.statusDanger }}>{display(job.error)}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["stdout", "stderr"] as const).map((value) => <ActionButton key={value} theme={theme} label={t(value)} selected={stream === value} onPress={() => setStream(value)} />)}
            <ActionButton theme={theme} label={t("copyOutput")} icon="Copy" onPress={() => { void copy(job[stream]); }} />
          </View>
          <ScrollView accessibilityLabel={t("outputLabel", { stream })} style={{ maxHeight: 300, minHeight: 80, minWidth: 0 }}>
            <Text selectable style={mono}>{job[stream].slice(0, 200_000) || t("empty")}{job[stream].length > 200_000 ? t("truncated") : ""}</Text>
          </ScrollView>
        </View>}
      </View>

      <Modal title={t("confirmTitle")} open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Text style={text}>{t("commandRisk")}</Text>
            <Text selectable style={muted}>{t("programValue", { value: state.data?.executable ?? "" })}</Text>
            <Text selectable style={muted}>{t("directoryValue", { value: state.data?.directory ?? "" })}</Text>
            <Text selectable style={mono}>{args ? JSON.stringify(args, null, 2) : argsText}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <ActionButton theme={theme} label={t("cancel")} onPress={() => setConfirmOpen(false)} />
              <ActionButton theme={theme} label={t("confirmRun")} primary disabled={!canRun} onPress={() => { setConfirmOpen(false); start.mutate(); }} />
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </ScrollView>
  );
}
