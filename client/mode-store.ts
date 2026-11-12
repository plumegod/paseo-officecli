export const documentTypes = ["docx", "pptx", "xlsx"] as const;
export type DocumentType = typeof documentTypes[number];
export type DocumentMode = "preview" | "watch";
export const MODE_STORAGE_KEYS = {
  docx: "paseo-officecli.mode.docx.v1",
  pptx: "paseo-officecli.mode.pptx.v1",
  xlsx: "paseo-officecli.mode.xlsx.v1",
} as const;
const defaults: Record<DocumentType, DocumentMode> = { docx: "watch", pptx: "watch", xlsx: "preview" };

export function documentType(path: string): DocumentType | null {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return documentTypes.find((type) => type === extension) ?? null;
}

export function createModeStore(storage: () => { getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined) {
  const listeners = new Set<() => void>();
  let current = { ...defaults };
  let error = false;
  const notify = () => { for (const listener of listeners) listener(); };
  const restore = () => {
    try {
      const target = storage();
      if (!target) { error = true; return; }
      const next = { ...defaults };
      for (const type of documentTypes) {
        const value = target.getItem(MODE_STORAGE_KEYS[type]);
        if (value === "preview" || value === "watch") next[type] = value;
      }
      current = next; error = false;
    } catch { error = true; }
  };
  restore();
  return {
    getSnapshot: () => current,
    getError: () => error,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh() { restore(); notify(); },
    set(type: DocumentType, value: string) {
      const mode = value === "preview" || value === "watch" ? value : defaults[type];
      current = { ...current, [type]: mode };
      try {
        const target = storage();
        target?.setItem(MODE_STORAGE_KEYS[type], mode); error = !target;
      } catch { error = true; }
      notify();
    },
  };
}
