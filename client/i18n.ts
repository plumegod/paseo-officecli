import { useSyncExternalStore } from "react";
import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import { normalizeLocale, resources, translate } from "../shared/locales.ts";
import { displayMessage } from "../shared/messages.ts";
import { createLanguageStore, LANGUAGE_STORAGE_KEY } from "./language-store.ts";
import { clientStorage, observeStorage } from "./web.ts";

export const messages = defineTranslations({ resources });
export const languageStore = createLanguageStore(clientStorage);
export function observeLanguageStorage() {
  return observeStorage((event) => { if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) languageStore.refresh(); });
}
export function useOfficeTranslation() {
  const host = useTranslation(messages); // Public SDK subscribes to the effective Paseo locale.
  const selected = useSyncExternalStore(languageStore.subscribe, languageStore.getSnapshot);
  const storageError = useSyncExternalStore(languageStore.subscribe, languageStore.getError);
  const locale = selected === "follow" ? normalizeLocale(host.locale) : selected;
  const t: typeof host.t = (key, ...args) => selected === "follow" && host.locale === locale
    ? host.t(key, ...args) : translate(locale, key, args[0]);
  return { locale, selected, storageError, setLanguage: languageStore.set, t, display: (value: unknown) => displayMessage(locale, value) };
}
