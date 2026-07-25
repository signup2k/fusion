import {
  zhMessages,
  type TranslationKey,
} from "@/lib/i18n/messages";

type TranslationParams = Record<string, string | number>;

export type { TranslationKey };

function formatMessage(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  key: TranslationKey,
  params?: TranslationParams,
): string {
  return formatMessage(zhMessages[key], params);
}

export function useI18n() {
  return { t: translate };
}
