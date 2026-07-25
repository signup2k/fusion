import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const articlePageSizeOptions = [10, 20, 30, 50, 100] as const;
export type ArticlePageSize = (typeof articlePageSizeOptions)[number];

export const fontSizeOptions = [
  "small",
  "default",
  "large",
  "xlarge",
] as const;
export type AppFontSize = (typeof fontSizeOptions)[number];

export const feedSortOptions = ["manual", "name", "unread", "newest"] as const;
export type FeedSort = (typeof feedSortOptions)[number];

const articlePageSizeSet = new Set<number>(articlePageSizeOptions);
const fontSizeSet = new Set<string>(fontSizeOptions);
const feedSortSet = new Set<string>(feedSortOptions);

const defaultArticlePageSize: ArticlePageSize = 10;
const defaultFontSize: AppFontSize = "default";
const defaultFeedSort: FeedSort = "manual";

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

function normalizeFeedSort(sort: string): FeedSort {
  if (feedSortSet.has(sort)) {
    return sort as FeedSort;
  }

  return defaultFeedSort;
}

function normalizeIdOrder(order: unknown): number[] {
  if (!Array.isArray(order)) {
    return [];
  }

  return [...new Set(order.filter((id): id is number => Number.isInteger(id)))];
}

function normalizeGroupAutoExpand(value: unknown): Record<number, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([groupId, autoExpand]) =>
        Number.isInteger(Number(groupId)) && typeof autoExpand === "boolean",
    ),
  );
}

export interface PreferencesState {
  articlePageSize: ArticlePageSize;
  fontSize: AppFontSize;
  feedSort: FeedSort;
  feedOrder: number[];
  groupOrder: number[];
  groupAutoExpand: Record<number, boolean>;
  setArticlePageSize: (size: number) => void;
  setFontSize: (size: string) => void;
  setFeedSort: (sort: string) => void;
  setFeedOrder: (order: number[]) => void;
  setGroupOrder: (order: number[]) => void;
  setGroupAutoExpand: (groupId: number, autoExpand: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      articlePageSize: defaultArticlePageSize,
      fontSize: defaultFontSize,
      feedSort: defaultFeedSort,
      feedOrder: [],
      groupOrder: [],
      groupAutoExpand: {},
      setArticlePageSize: (size) =>
        set({ articlePageSize: normalizeArticlePageSize(size) }),
      setFontSize: (size) => set({ fontSize: normalizeFontSize(size) }),
      setFeedSort: (sort) => set({ feedSort: normalizeFeedSort(sort) }),
      setFeedOrder: (order) => set({ feedOrder: normalizeIdOrder(order) }),
      setGroupOrder: (order) => set({ groupOrder: normalizeIdOrder(order) }),
      setGroupAutoExpand: (groupId, autoExpand) =>
        set((state) => ({
          groupAutoExpand: {
            ...state.groupAutoExpand,
            [groupId]: autoExpand,
          },
        })),
    }),
    {
      name: "fusion-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        articlePageSize: state.articlePageSize,
        fontSize: state.fontSize,
        feedSort: state.feedSort,
        feedOrder: state.feedOrder,
        groupOrder: state.groupOrder,
        groupAutoExpand: state.groupAutoExpand,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PreferencesState> | undefined;

        return {
          ...currentState,
          articlePageSize: normalizeArticlePageSize(
            persisted?.articlePageSize ?? currentState.articlePageSize,
          ),
          fontSize: normalizeFontSize(
            persisted?.fontSize ?? currentState.fontSize,
          ),
          feedSort: normalizeFeedSort(
            persisted?.feedSort ?? currentState.feedSort,
          ),
          feedOrder: normalizeIdOrder(persisted?.feedOrder),
          groupOrder: normalizeIdOrder(persisted?.groupOrder),
          groupAutoExpand: normalizeGroupAutoExpand(
            persisted?.groupAutoExpand,
          ),
        };
      },
    },
  ),
);
