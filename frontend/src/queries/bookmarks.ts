import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import {
  bookmarkAPI,
  type Bookmark,
  type Item,
  type ListAPIResponse,
} from "@/lib/api";
import {
  normalizeBookmarkFilters,
  queryKeys,
  type BookmarkFilters,
  type NormalizedBookmarkFilters,
} from "./keys";
import { useFeedLookup } from "./feeds";
import { usePreferencesStore } from "@/store";

// The lookup query (star icons + sidebar count) fetches a large first page so
// most users' bookmarks are covered in a single request. 100 is also the
// backend per-request cap, so it is the natural chunk size.
const BOOKMARK_LOOKUP_PAGE_SIZE = 100;

type BookmarkListResponse = ListAPIResponse<Bookmark>;
export type BookmarksInfiniteData = InfiniteData<BookmarkListResponse, string | null>;

export function resolveBookmarkItemId(bookmark: Bookmark): number {
  return bookmark.item_id ?? -bookmark.id;
}

function buildListBookmarksParams(
  filters: NormalizedBookmarkFilters,
  cursor: string | null,
  pageSize: number,
) {
  const params: Parameters<typeof bookmarkAPI.list>[0] = {
    limit: pageSize,
  };
  if (filters.feedId) params.feed_id = filters.feedId;
  if (filters.groupId) params.group_id = filters.groupId;
  if (cursor) params.before = cursor;
  return params;
}

// useBookmarks is the shared infinite query over bookmarks. Callers pass the
// filters and page size that fit their use case (lookup vs. starred list).
function useBookmarks(
  filters: BookmarkFilters,
  pageSize: number,
  enabled = true,
) {
  const normalized = normalizeBookmarkFilters(filters);
  return useInfiniteQuery({
    queryKey: [...queryKeys.bookmarks.lists(), normalized, pageSize],
    queryFn: async ({ pageParam }) =>
      bookmarkAPI.list(
        buildListBookmarksParams(normalized, pageParam, pageSize),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });
}

// useBookmarkLookup powers star indicators and the sidebar starred count.
// It is intentionally unfiltered so star state is consistent across views;
// the first page (up to BOOKMARK_LOOKUP_PAGE_SIZE) covers the common case and
// `total` always reflects the true global count.
export function useBookmarkLookup() {
  const query = useBookmarks({}, BOOKMARK_LOOKUP_PAGE_SIZE);

  const bookmarks = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
    [query.data],
  );
  const total = query.data?.pages.at(-1)?.total ?? 0;

  const byItemId = useMemo(
    () => new Map(bookmarks.map((b) => [resolveBookmarkItemId(b), b])),
    [bookmarks],
  );

  const isItemStarred = useCallback(
    (itemId: number) => byItemId.has(itemId),
    [byItemId],
  );

  const getBookmarkByItemId = useCallback(
    (itemId: number) => byItemId.get(itemId),
    [byItemId],
  );

  return { bookmarks, total, isItemStarred, getBookmarkByItemId };
}

export interface StarredItemsResult {
  items: Item[];
  bookmarks: Bookmark[];
  hasNextPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

// useStarredItems is the paginated, server-filtered starred list. Filtering by
// feed/group is pushed to the backend, so pagination is correct in every scope.
export function useStarredItems(
  filters: BookmarkFilters,
  enabled = true,
): StarredItemsResult {
  const pageSize = usePreferencesStore((state) => state.articlePageSize);
  const query = useBookmarks(filters, pageSize, enabled);

  const bookmarks = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
    [query.data],
  );

  const items = useMemo<Item[]>(
    () =>
      bookmarks.map((bookmark) => ({
        id: bookmark.item_id ?? -bookmark.id,
        feed_id: bookmark.feed_id ?? 0,
        guid: bookmark.link || `bookmark:${bookmark.id}`,
        title: bookmark.title,
        link: bookmark.link,
        content: bookmark.content,
        pub_date: bookmark.pub_date,
        unread: bookmark.unread,
        created_at: bookmark.created_at,
      })),
    [bookmarks],
  );

  return {
    items,
    bookmarks,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}

interface BookmarkMutationContext {
  previousLists: Array<
    [readonly unknown[], BookmarksInfiniteData | undefined]
  >;
}

function snapshotBookmarkLists(qc: QueryClient) {
  return {
    previousLists: qc.getQueriesData<BookmarksInfiniteData>({
      queryKey: queryKeys.bookmarks.lists(),
    }),
  } satisfies BookmarkMutationContext;
}

function restoreBookmarkLists(
  qc: QueryClient,
  context: BookmarkMutationContext | undefined,
) {
  if (!context) return;
  for (const [key, data] of context.previousLists) {
    qc.setQueryData(key, data);
  }
}

function upsertBookmarkInCaches(qc: QueryClient, bookmark: Bookmark) {
  const itemId = resolveBookmarkItemId(bookmark);
  qc.setQueriesData<BookmarksInfiniteData>(
    { queryKey: queryKeys.bookmarks.lists() },
    (old) => {
      if (!old || old.pages.length === 0) return old;

      const exists = old.pages.some((page) =>
        page.data.some((entry) => resolveBookmarkItemId(entry) === itemId),
      );
      const pages = old.pages.map((page, pageIndex) => {
        const data = page.data.map((entry) =>
          resolveBookmarkItemId(entry) === itemId ? bookmark : entry,
        );
        if (exists) {
          return data.some((entry, index) => entry !== page.data[index])
            ? { ...page, data }
            : page;
        }

        return {
          ...page,
          data: pageIndex === 0 ? [bookmark, ...data] : data,
          total: page.total + 1,
        };
      });

      return { ...old, pages };
    },
  );
}

function removeBookmarkFromCaches(qc: QueryClient, bookmarkId: number) {
  qc.setQueriesData<BookmarksInfiniteData>(
    { queryKey: queryKeys.bookmarks.lists() },
    (old) => {
      if (!old) return old;
      const exists = old.pages.some((page) =>
        page.data.some((bookmark) => bookmark.id === bookmarkId),
      );
      if (!exists) return old;

      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.filter((bookmark) => bookmark.id !== bookmarkId),
          total: Math.max(0, page.total - 1),
        })),
      };
    },
  );
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  const { getFeedById } = useFeedLookup();

  return useMutation({
    mutationFn: async (item: Item) => {
      const res = await bookmarkAPI.create({ item_id: item.id });
      return res.data!;
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: queryKeys.bookmarks.all });
      const context = snapshotBookmarkLists(qc);
      const feed = getFeedById(item.feed_id);
      upsertBookmarkInCaches(qc, {
        id: -item.id,
        item_id: item.id,
        link: item.link,
        title: item.title,
        content: item.content,
        pub_date: item.pub_date,
        feed_name: feed?.name ?? "Unknown",
        feed_id: item.feed_id,
        unread: item.unread,
        created_at: Math.floor(Date.now() / 1000),
      });
      return context;
    },
    onSuccess: (bookmark) => {
      upsertBookmarkInCaches(qc, bookmark);
    },
    onError: (_error, _item, context) => {
      restoreBookmarkLists(qc, context);
    },
    onSettled: () => {
      return qc.invalidateQueries({
        queryKey: queryKeys.bookmarks.all,
        refetchType: "none",
      });
    },
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: number) => {
      await bookmarkAPI.delete(bookmarkId);
      return bookmarkId;
    },
    onMutate: async (bookmarkId) => {
      await qc.cancelQueries({ queryKey: queryKeys.bookmarks.all });
      const context = snapshotBookmarkLists(qc);
      removeBookmarkFromCaches(qc, bookmarkId);
      return context;
    },
    onError: (_error, _bookmarkId, context) => {
      restoreBookmarkLists(qc, context);
    },
    onSettled: () => {
      return qc.invalidateQueries({
        queryKey: queryKeys.bookmarks.all,
        refetchType: "none",
      });
    },
  });
}
