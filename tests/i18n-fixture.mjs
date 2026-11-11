import { defineTranslations } from "@getpaseo/plugin/client";
import { resources, translate } from "../shared/locales.ts";
import { displayMessage } from "../shared/messages.ts";

export const messages = defineTranslations({ resources });
export function translations(locale = "zh-CN") {
  return { locale, t: (key, values) => translate(locale, key, values), display: (value) => displayMessage(locale, value),
    selected: "follow", setLanguage() {}, storageError: false };
}
