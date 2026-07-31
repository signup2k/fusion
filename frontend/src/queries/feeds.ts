import { useMemo, useCallback } from "react";
import {
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { feedAPI, type Feed } from "@/lib/api";
import { queryKeys } from "./keys";

const refreshPollDelays = [500, 1000, 2000, 4000, 8000, 15000] as const;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

async function synchronizeRefresh(
  qc: QueryClient,
  targetFeedIds: number[],
  requestedAt: number,
): Promise<void> {
  let completedCount = 0;
  const targetFeedIdSet = new Set(targetFeedIds);

  for (const delayMs of refreshPollDelays) {
    await wait(delayMs);

    const response = await feedAPI.list();
    const feeds = response.data;
    qc.setQueryData(queryKeys.feeds.list(), feeds);

    if (targetFeedIds.length === 0) {
      await qc.invalidateQueries({ queryKey: queryKeys.items.all });
      return;
    }

    const completedFeedIds = new Set(
      feeds
        .filter(
          (feed) =>
            targetFeedIdSet.has(feed.id) &&
            feed.fetch_state.last_checked_at >= requestedAt,
        )
        .map((feed) => feed.id),
    );

    if (completedFeedIds.size > completedCount) {
      completedCount = completedFeedIds.size;
      await qc.invalidateQueries({ queryKey: queryKeys.items.all });
    }

    if (completedFeedIds.size === targetFeedIds.length) {
      return;
    }
  }

  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.feeds.all }),
    qc.invalidateQueries({ queryKey: queryKeys.items.all }),
  ]);
}

export const feedQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.feeds.list(),
      queryFn: async () => {
        const res = await feedAPI.list();
        return res.data;
      },
    }),
};

export function useFeeds() {
  return useQuery(feedQueries.list());
}

export function useFeedLookup() {
  const { data: feeds = [], isLoading } = useFeeds();

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  const getFeedById = useCallback(
    (feedId: number) => feedMap.get(feedId),
    [feedMap],
  );

  const getFeedsByGroup = useCallback(
    (groupId: number) => feeds.filter((f) => f.group_id === groupId),
    [feeds],
  );

  return { feeds, getFeedById, getFeedsByGroup, isLoading };
}

export function useUnreadCounts() {
  const { data: feeds = [] } = useFeeds();

  const getUnreadCount = useCallback(
    (feedId: number) => feeds.find((f) => f.id === feedId)?.unread_count ?? 0,
    [feeds],
  );

  const getGroupUnreadCount = useCallback(
    (groupId: number) =>
      feeds
        .filter((f) => f.group_id === groupId)
        .reduce((sum, f) => sum + (f.unread_count ?? 0), 0),
    [feeds],
  );

  const getTotalUnreadCount = useCallback(
    () => feeds.reduce((sum, f) => sum + (f.unread_count ?? 0), 0),
    [feeds],
  );

  return { getUnreadCount, getGroupUnreadCount, getTotalUnreadCount };
}

export function useCreateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: Parameters<typeof feedAPI.create>[0]) => {
      const res = await feedAPI.create(req);
      return res.data!;
    },
    onSuccess: (feed) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old ? [...old, feed] : [feed],
      );
    },
  });
}

export function useUpdateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Parameters<typeof feedAPI.update>[1] & { id: number }) => {
      const res = await feedAPI.update(id, data);
      return res.data!;
    },
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.map((f) => (f.id === updated.id ? updated : f)),
      );
    },
  });
}

export function useDeleteFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await feedAPI.delete(id);
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.filter((f) => f.id !== id),
      );
      qc.invalidateQueries({ queryKey: queryKeys.items.all });
    },
  });
}

export function useDeleteFeeds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => feedAPI.delete(id)));
      return ids;
    },
    onSuccess: (ids) => {
      const deletedIds = new Set(ids);
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.filter((feed) => !deletedIds.has(feed.id)),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.feeds.all });
      qc.invalidateQueries({ queryKey: queryKeys.items.all });
    },
  });
}

export function useRefreshFeeds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const requestedAt = Math.floor(Date.now() / 1000);
      const feeds = qc.getQueryData<Feed[]>(queryKeys.feeds.list()) ?? [];
      const targetFeedIds = feeds
        .filter((feed) => !feed.suspended)
        .map((feed) => feed.id);

      await feedAPI.refresh();
      await synchronizeRefresh(qc, targetFeedIds, requestedAt);
    },
  });
}

export function useRefreshFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const requestedAt = Math.floor(Date.now() / 1000);
      await feedAPI.refreshOne(id);
      await synchronizeRefresh(qc, [id], requestedAt);
    },
  });
}

export function useCheckFeed() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await feedAPI.check(id);
      return res.data!;
    },
  });
}

export function useMoveFeedsToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromGroupId,
      toGroupId,
    }: {
      fromGroupId: number;
      toGroupId: number;
    }) => {
      const feeds = qc.getQueryData<Feed[]>(queryKeys.feeds.list()) ?? [];
      const toMove = feeds.filter((f) => f.group_id === fromGroupId);
      await Promise.all(
        toMove.map((f) => feedAPI.update(f.id, { group_id: toGroupId })),
      );
      return { fromGroupId, toGroupId };
    },
    onSuccess: ({ fromGroupId, toGroupId }) => {
      qc.setQueryData(queryKeys.feeds.list(), (old: Feed[] | undefined) =>
        old?.map((f) =>
          f.group_id === fromGroupId ? { ...f, group_id: toGroupId } : f,
        ),
      );
    },
  });
}
