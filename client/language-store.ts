import { locales, type Locale } from "../shared/locales.ts";

export type LanguagePreference = "follow" | Locale;
export const LANGUAGE_STORAGE_KEY = "paseo-officecli.language.v1";
export { languageNames } from "../shared/locales.ts";
export interface LanguageStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function preference(value: unknown): LanguagePreference {
  return value === "follow" || locales.includes(value as Locale) ? value as LanguagePreference : "follow";
}
export function createLanguageStore(storage: () => LanguageStorage | undefined) {
  const listeners = new Set<() => void>();
  let current: LanguagePreference = "follow";
  let error = false;
  const notify = () => { for (const listener of listeners) listener(); };
  const restore = () => {
    try { current = preference(storage()?.getItem(LANGUAGE_STORAGE_KEY)); error = false; }
    catch { error = true; }
  };
  restore();
  return {
    getSnapshot: () => current,
    getError: () => error,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh() { restore(); notify(); },
    set(next: LanguagePreference) {
      current = next;
      try {
        const target = storage();
        target?.setItem(LANGUAGE_STORAGE_KEY, next); error = !target;
      } catch { error = true; }
      notify();
    },
  };
}
