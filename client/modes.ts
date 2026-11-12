import { useSyncExternalStore } from "react";
import { createModeStore, MODE_STORAGE_KEYS } from "./mode-store.ts";

import { clientStorage, observeStorage } from "./web.ts";

export const modeStore = createModeStore(clientStorage);

export function observeModeStorage() {
  return observeStorage((event) => {
    if (event.key === null || Object.values(MODE_STORAGE_KEYS).some((key) => key === event.key)) modeStore.refresh();
  });
}

export function useDocumentModes() {
  const modes = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot);
  const storageError = useSyncExternalStore(modeStore.subscribe, modeStore.getError);
  return { modes, storageError, setMode: modeStore.set };
}
