import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink, ScrollView, SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { officeSettings, statusRpc } from "../shared/officecli";
import { useOfficeTranslation } from "./i18n";
import { languageNames } from "./language-store";
import { locales } from "../shared/locales";

export function OfficeSettings({ theme, layout }: PluginSurfaceProps) {
  const { t, display, selected, setLanguage, storageError } = useOfficeTranslation();
  const settings = useSettings(officeSettings);
  const status = useRpc(statusRpc);
  const check = useQuery({ queryKey: ["officecli.status"], queryFn: () => status({ refresh: true }), retry: false });
  const [path, setPath] = useState("");
  const savedPath = settings.status === "ready" ? settings.values.executable : "";
  useEffect(() => setPath(savedPath), [savedPath]);

  const colors = theme.colors;
  const current = check.data;
  const hint = current && !check.isError
    ? t("currentPath", { version: current.version || t("unknownVersion"), path: current.executable })
    : t("pathHint");

  return (
    <ScrollView style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, paddingBottom: 32 }}>
      <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: 28 }}>
        <SettingsSection title={t("language")}>
          <SettingsCard>
            <SettingsSelect label={t("language")} hint={t("languageScope")} error={storageError ? t("storageUnavailable") : null}
              value={selected} onValueChange={setLanguage}
              options={[{ value: "follow", label: t("follow") }, ...locales.map((locale) => ({ value: locale, label: languageNames[locale] }))]} />
          </SettingsCard>
        </SettingsSection>
        <SettingsSection title={t("program")}>
          <SettingsCard>
            {settings.status === "ready" ? <SettingsInput key={settings.revision} label={t("executablePath")} hint={hint} error={check.isError ? display(check.error) : null}
              placeholder={t("autoFind")} disabled={settings.saving} initialValue={savedPath} onChangeText={setPath} />
              : <SettingsRow label={t("executablePath")} hint={settings.status === "loading" ? t("reading") : undefined}
                error={settings.status === "error" ? display(settings.error) : null} />}
            {settings.status === "ready" && (path.trim() !== savedPath || settings.saving) && <SettingsAction label={t("saveChanges")} actionLabel={settings.saving ? t("saving") : t("save")}
              disabled={settings.saving} error={settings.saveError ? display(settings.saveError) : null} onPress={() => {
                void settings.save({ executable: path.trim() }, settings.revision).then((saved) => { if (saved) void check.refetch(); });
              }} />}
            <SettingsAction label={t("detectInstallation")} actionLabel={check.isFetching ? t("detecting") : t("recheck")}
              disabled={check.isFetching} onPress={() => { void check.refetch(); }} />
            {current && !check.isError && <>
              <SettingsRow label={t("installationStatus")} hint={display(current.diagnostic)} />
              {(Object.entries({ htmlPreview: t("htmlPreview"), get: t("getShortcut"), batch: t("batchShortcut"), save: t("saveCommand"), mcp: t("mcpShortcut") }) as [keyof typeof current.capabilities, string][]).map(([key, label]) => {
                const capability = current.capabilities[key];
                const state = t(capability.status);
                return <SettingsRow key={key} label={label} hint={`${state} · ${display(capability.diagnostic)}`} />;
              })}
            </>}
            <SettingsRow label={t("supportVersion")} hint={t("supportPolicy")}>
              <ExternalLink href="https://github.com/iOfficeAI/OfficeCLI#installation" accessibilityLabel={t("officialInstallLabel")}>
                <Text style={{ color: colors.accent, fontSize: 13 }}>{t("officialInstall")}</Text>
              </ExternalLink>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
