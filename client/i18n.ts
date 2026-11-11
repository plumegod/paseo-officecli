import { useSyncExternalStore } from "react";
import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import { normalizeLocale, resources, translate } from "../shared/locales.ts";
import { displayMessage } from "../shared/messages.ts";
import { createLanguageStore, LANGUAGE_STORAGE_KEY, type LanguageStorage } from "./language-store.ts";

export const messages = defineTranslations({ resources });
const browser = globalThis as typeof globalThis & {
  localStorage?: LanguageStorage;
  addEventListener?: (name: string, listener: (event: { key: string | null }) => void) => void;
  removeEventListener?: (name: string, listener: (event: { key: string | null }) => void) => void;
};
export const languageStore = createLanguageStore(() => browser.localStorage);
export function observeLanguageStorage() {
  const listener = (event: { key: string | null }) => { if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) languageStore.refresh(); };
  browser.addEventListener?.("storage", listener);
  return () => browser.removeEventListener?.("storage", listener);
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
