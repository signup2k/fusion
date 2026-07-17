import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const supportedLocales = [
  "en",
  "zh",
  "de",
  "fr",
  "es",
  "ru",
  "pt",
  "sv",
] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const articlePageSizeOptions = [10, 20, 30, 50, 100] as const;
export type ArticlePageSize = (typeof articlePageSizeOptions)[number];

export const fontSizeOptions = [
  "small",
  "default",
  "large",
  "xlarge",
] as const;
export type AppFontSize = (typeof fontSizeOptions)[number];

const localeSet = new Set<AppLocale>(supportedLocales);
const articlePageSizeSet = new Set<number>(articlePageSizeOptions);
const fontSizeSet = new Set<string>(fontSizeOptions);

function resolveSupportedLocale(locale: string): AppLocale | null {
  const normalized = locale.toLowerCase().replace("_", "-");

  if (localeSet.has(normalized as AppLocale)) {
    return normalized as AppLocale;
  }

  const languageCode = normalized.split("-")[0];
  if (localeSet.has(languageCode as AppLocale)) {
    return languageCode as AppLocale;
  }

  return null;
}

const defaultLocale: AppLocale =
  (typeof navigator !== "undefined" &&
    resolveSupportedLocale(navigator.language)) ||
  "en";
const defaultArticlePageSize: ArticlePageSize = 10;
const defaultFontSize: AppFontSize = "default";

function normalizeLocale(locale: string): AppLocale {
  const supportedLocale = resolveSupportedLocale(locale);
  if (supportedLocale) {
    return supportedLocale;
  }

  return defaultLocale;
}

function normalizeArticlePageSize(size: number): ArticlePageSize {
  if (articlePageSizeSet.has(size)) {
    return size as ArticlePageSize;
  }

  return defaultArticlePageSize;
}

function normalizeFontSize(size: string): AppFontSize {
  if (fontSizeSet.has(size)) {
    return size as AppFontSize;
  }

  return defaultFontSize;
}

export interface PreferencesState {
  locale: AppLocale;
  articlePageSize: ArticlePageSize;
  fontSize: AppFontSize;
  setLocale: (locale: string) => void;
  setArticlePageSize: (size: number) => void;
  setFontSize: (size: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      articlePageSize: defaultArticlePageSize,
      fontSize: defaultFontSize,
      setLocale: (locale) => set({ locale: normalizeLocale(locale) }),
      setArticlePageSize: (size) =>
        set({ articlePageSize: normalizeArticlePageSize(size) }),
      setFontSize: (size) => set({ fontSize: normalizeFontSize(size) }),
    }),
    {
      name: "fusion-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        locale: state.locale,
        articlePageSize: state.articlePageSize,
        fontSize: state.fontSize,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PreferencesState> | undefined;

        return {
          ...currentState,
          locale: normalizeLocale(persisted?.locale ?? currentState.locale),
          articlePageSize: normalizeArticlePageSize(
            persisted?.articlePageSize ?? currentState.articlePageSize,
          ),
          fontSize: normalizeFontSize(
            persisted?.fontSize ?? currentState.fontSize,
          ),
        };
      },
    },
  ),
);

export function getPreferredLocale(): AppLocale {
  return usePreferencesStore.getState().locale;
}
