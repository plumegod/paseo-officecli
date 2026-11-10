import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink, ScrollView, SettingsAction, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { officeSettings, statusRpc } from "../shared/officecli";

export function OfficeSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(officeSettings);
  const status = useRpc(statusRpc);
  const check = useQuery({ queryKey: ["officecli.status"], queryFn: () => status({}), retry: false });
  const [path, setPath] = useState("");
  const savedPath = settings.status === "ready" ? settings.values.executable : "";
  useEffect(() => setPath(savedPath), [savedPath]);
  const text = { color: theme.colors.foreground, lineHeight: 22 };
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      <SettingsSection title="OfficeCLI">
        <SettingsRow label="官方程序" hint={check.isFetching ? "正在检查…" : "每次执行都重新查找，不绑定插件版本。"}>
          <Text selectable style={text}>{check.isError ? check.error.message : check.data ? `${check.data.version}\n${check.data.executable}` : "尚未检测到 OfficeCLI"}</Text>
        </SettingsRow>
        {settings.status === "ready" ? <>
          <SettingsInput key={settings.revision} label="可执行文件绝对路径（可选）" hint="留空：OFFICECLI_PATH → PATH → 官方默认安装位置。填路径时不加引号。" initialValue={savedPath} onChangeText={setPath} />
          <SettingsAction label="保存路径" actionLabel={settings.saving ? "保存中…" : "保存并检查"} disabled={settings.saving} error={settings.saveError} onPress={() => {
            void settings.save({ executable: path.trim() }, settings.revision).then((saved) => { if (saved) void check.refetch(); });
          }} />
        </> : <Text style={text}>{settings.status === "loading" ? "正在读取设置…" : settings.error}</Text>}
        <SettingsAction label="检测当前版本" actionLabel="重新检查" disabled={check.isFetching} onPress={() => { void check.refetch(); }} />
      </SettingsSection>
      <SettingsSection title="打开与编辑">
        <Text style={text}>在文件树点击 .docx、.xlsx 或 .pptx，选择 OfficeCLI，勾选“不再询问”，点击“使用”。也可以在 设置 → 文件 中设定默认打开方式。</Text>
        <Text style={text}>文件面板的“命令工作台”可直接运行完整官方命令，覆盖创建、读取、分析、修改和重组。工作区顶部“新建标签页（＋）→ OfficeCLI 命令”可打开独立工作台，命令中心也有入口，无需先打开文档。参数使用 JSON 字符串数组，不加 officecli 前缀；可查看当前官方帮助、发送标准输入、查看输出和停止长任务。</Text>
        <Text style={text}>HTML 预览本身不是可视化编辑器。命令完成后返回预览可读取最新内容；save/close 写入磁盘后会自动刷新。插件不追加保存、覆盖或关闭常驻进程的命令；官方 resident 自身的自动保存行为保持不变。</Text>
        <Text style={text}>执行前须确认宿主权限：官方命令可以修改工作区外文件、插件或全局配置，不是文件系统沙箱。请备份重要文件；停止进程不会撤销已经完成的修改。</Text>
      </SettingsSection>
      <SettingsSection title="独立安装 / 升级">
        <Text style={text}>按官方说明重新运行安装器，即可安装最新 OfficeCLI。无需升级或重装本插件；升级完成后点击“重新检查”和文件面板的“刷新”。不要使用 officecli update（官方没有此命令）。</Text>
        <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation"><Text style={{ color: theme.colors.accent }}>官方安装与升级说明 ↗</Text></ExternalLink>
        <Text style={text}>文档在本机处理。预览隔离于 Paseo 主页面，阻止外部资源加载；在线字体、公式库和 3D 资源不可用。文档内的外链仍可能在隔离框架中导航，请勿打开不可信链接。仅支持桌面端/浏览器；旧版 .doc/.xls/.ppt 不支持。</Text>
      </SettingsSection>
    </ScrollView>
  );
}
