import { useSyncExternalStore } from "react";
import { createModeStore, MODE_STORAGE_KEYS } from "./mode-store.ts";

const browser = globalThis as typeof globalThis & {
  localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  addEventListener?: (name: string, listener: (event: { key: string | null }) => void) => void;
  removeEventListener?: (name: string, listener: (event: { key: string | null }) => void) => void;
};
export const modeStore = createModeStore(() => browser.localStorage);

export function observeModeStorage() {
  const listener = (event: { key: string | null }) => {
    if (event.key === null || Object.values(MODE_STORAGE_KEYS).some((key) => key === event.key)) modeStore.refresh();
  };
  browser.addEventListener?.("storage", listener);
  return () => browser.removeEventListener?.("storage", listener);
}

export function useDocumentModes() {
  const modes = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot);
  const storageError = useSyncExternalStore(modeStore.subscribe, modeStore.getError);
  return { modes, storageError, setMode: modeStore.set };
}
