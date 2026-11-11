import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink, ScrollView, SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { officeSettings, statusRpc } from "../shared/officecli";

export function OfficeSettings({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(officeSettings);
  const status = useRpc(statusRpc);
  const check = useQuery({ queryKey: ["officecli.status"], queryFn: () => status({}), retry: false });
  const [path, setPath] = useState("");
  const savedPath = settings.status === "ready" ? settings.values.executable : "";
  useEffect(() => setPath(savedPath), [savedPath]);

  const colors = theme.colors;
  const hint = check.data && !check.isError
    ? `留空时自动查找。当前：${check.data.version} · ${check.data.executable}`
    : "留空时自动查找；自定义路径须为绝对路径。";

  return (
    <ScrollView style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, paddingBottom: 32 }}>
      <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: 28 }}>
        <SettingsSection title="程序">
          <SettingsCard>
            {settings.status === "ready" ? <SettingsInput key={settings.revision} label="可执行文件路径" hint={hint} error={check.isError ? check.error.message : null}
              placeholder="自动查找" disabled={settings.saving} initialValue={savedPath} onChangeText={setPath} />
              : <SettingsRow label="可执行文件路径" hint={settings.status === "loading" ? "正在读取…" : undefined}
                error={settings.status === "error" ? settings.error : null} />}
            {settings.status === "ready" && (path.trim() !== savedPath || settings.saving) && <SettingsAction label="保存更改" actionLabel={settings.saving ? "保存中" : "保存"}
              disabled={settings.saving} error={settings.saveError} onPress={() => {
                void settings.save({ executable: path.trim() }, settings.revision).then((saved) => { if (saved) void check.refetch(); });
              }} />}
            <SettingsAction label="检测路径和版本" actionLabel={check.isFetching ? "检测中" : "重新检测"}
              disabled={check.isFetching} onPress={() => { void check.refetch(); }} />
            <SettingsRow label="支持版本" hint="最低支持 OfficeCLI 1.0.160；较旧版本请升级至官方稳定版。后续版本需保持公开接口兼容，否则可能需要更新插件。">
              <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation" accessibilityLabel="OfficeCLI 官方安装与升级说明">
                <Text style={{ color: colors.accent, fontSize: 13 }}>官方安装与升级</Text>
              </ExternalLink>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
