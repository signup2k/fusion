import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticleItem } from "./article-item";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { useUrlState, type ArticleFilter } from "@/hooks/use-url-state";
import { useArticleList } from "@/hooks/use-article-list";
import {
  itemQueries,
  useMarkAllItemsRead,
  useMarkItemsRead,
  useMarkItemsUnread,
} from "@/queries/items";
import { useFeedLookup } from "@/queries/feeds";
import { useGroups } from "@/queries/groups";
import { useCreateBookmark, useDeleteBookmark } from "@/queries/bookmarks";
import { getFaviconUrl } from "@/lib/api/favicon";
import { useI18n } from "@/lib/i18n";
import type { Item } from "@/lib/api";

export function ArticleList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    articleFilter,
    setArticleFilter,
    selectedFeedId,
    selectedGroupId,
    selectedArticleId,
    setSelectedArticle,
  } = useUrlState();

  const {
    articles,
    hasMore,
    isLoading,
    isLoadingMore,
    fetchNextPage,
    isItemStarred,
    getBookmarkByItemId,
  } = useArticleList({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
  });

  const { data: groups = [] } = useGroups();
  const { feeds, getFeedById, isLoading: isFeedsLoading } = useFeedLookup();
  const markItemsRead = useMarkItemsRead();
  const markItemsUnread = useMarkItemsUnread();
  const markAllItemsRead = useMarkAllItemsRead();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const markItemsReadAsync = markItemsRead.mutateAsync;
  const markItemsUnreadAsync = markItemsUnread.mutateAsync;
  const createBookmarkAsync = createBookmark.mutateAsync;
  const deleteBookmarkAsync = deleteBookmark.mutateAsync;
  const setSelectedArticleRef = useRef(setSelectedArticle);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setSelectedArticleRef.current = setSelectedArticle;
  }, [setSelectedArticle]);
  const selectArticle = useCallback(
    (articleId: number | null) => setSelectedArticleRef.current(articleId),
    [],
  );
  const prefetchArticle = useCallback(
    (articleId: number) => {
      if (articleId > 0) {
        void queryClient.prefetchQuery(itemQueries.detail(articleId));
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const loadMore = loadMoreRef.current;
    if (!loadMore || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(loadMore);

    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, isLoadingMore]);

  const articleIds = articles.map((a) => a.id);
  useArticleNavigation(articleIds, {
    enabled: selectedArticleId === null,
  });

  let title = t("article.list.all");
  if (selectedFeedId) {
    const feed = getFeedById(selectedFeedId);
    title = feed?.name ?? t("article.feedFallback");
  } else if (selectedGroupId) {
    const group = groups.find((g) => g.id === selectedGroupId);
    title = group?.name ?? t("article.groupFallback");
  }

  const unreadCount = articles.filter((a) => a.unread).length;
  const scopedUnreadCount = selectedFeedId
    ? (getFeedById(selectedFeedId)?.unread_count ?? 0)
    : selectedGroupId
      ? feeds
          .filter((feed) => feed.group_id === selectedGroupId)
          .reduce((total, feed) => total + feed.unread_count, 0)
      : feeds.reduce((total, feed) => total + feed.unread_count, 0);
  const canMarkAllAsRead = Math.max(unreadCount, scopedUnreadCount) > 0;
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;

  const handleToggleRead = useCallback(
    async (article: Item) => {
      if (article.id <= 0) return;

      try {
        if (article.unread) {
          await markItemsReadAsync([article.id]);
        } else {
          await markItemsUnreadAsync([article.id]);
        }
      } catch (error) {
        console.error("Failed to toggle read status:", error);
      }
    },
    [markItemsReadAsync, markItemsUnreadAsync],
  );

  const handleToggleStar = useCallback(
    async (article: Item) => {
      if (createBookmark.isPending || deleteBookmark.isPending) return;

      try {
        if (isItemStarred(article.id)) {
          const bookmark = getBookmarkByItemId(article.id);
          if (bookmark && bookmark.id > 0) {
            await deleteBookmarkAsync(bookmark.id);
          }
          return;
        }

        await createBookmarkAsync(article);
      } catch (error) {
        console.error("Failed to toggle star:", error);
      }
    },
    [
      createBookmarkAsync,
      createBookmark.isPending,
      deleteBookmarkAsync,
      deleteBookmark.isPending,
      getBookmarkByItemId,
      isItemStarred,
    ],
  );

  const handleMarkAllAsRead = async () => {
    const unreadIds = articles
      .filter((a) => a.unread && a.id > 0)
      .map((a) => a.id);

    try {
      await markAllItemsRead.mutateAsync({
        visibleIds: unreadIds,
        scope: {
          feed_id: selectedFeedId ?? undefined,
          group_id: selectedGroupId ?? undefined,
        },
      });
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ContentHeader>
        <div className="flex min-w-0 items-center gap-1">
          <SidebarTrigger />
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        </div>
        {articleFilter !== "starred" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={!canMarkAllAsRead || markAllItemsRead.isPending}
            className="gap-1.5 text-xs"
          >
            {markAllItemsRead.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            {t("article.list.markAllRead")}
          </Button>
        )}
      </ContentHeader>

      {/* Article area with filter tabs */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6">
        {/* Filter tabs - hidden when no articles exist */}
        {!hasNoFeeds && (articles.length > 0 || articleFilter !== "all") && (
          <Tabs
            value={articleFilter}
            onValueChange={(v) => setArticleFilter(v as ArticleFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">{t("article.filter.all")}</TabsTrigger>
              <TabsTrigger value="unread">{t("article.filter.unread")}</TabsTrigger>
              <TabsTrigger value="starred">
                {t("article.filter.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Article list */}
        <ScrollArea className="min-h-0 flex-1">
          <div>
            {isLoading && articles.length === 0 ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-md bg-accent"
                  />
                ))}
              </div>
            ) : articles.length === 0 ? (
              hasNoFeeds ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("article.list.noFeeds")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate({ to: "/feeds" })}
                  >
                    {t("article.list.openFeedManagement")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("article.list.noArticles")}
                  </p>
                </div>
              )
            ) : (
              <>
                {articles.map((article) => {
                  const feed = getFeedById(article.feed_id);
                  const bookmark = getBookmarkByItemId(article.id);

                  return (
                    <ArticleItem
                      key={article.id}
                      article={article}
                      isSelected={selectedArticleId === article.id}
                      onSelectArticle={selectArticle}
                      onToggleRead={handleToggleRead}
                      onToggleStar={handleToggleStar}
                      onPrefetchArticle={prefetchArticle}
                      canToggleRead={article.id > 0}
                      isStarred={isItemStarred(article.id)}
                      feedName={feed?.name ?? bookmark?.feed_name ?? t("common.unknown")}
                      feedFaviconUrl={
                        feed ? getFaviconUrl(feed.link, feed.site_url) : null
                      }
                    />
                  );
                })}
                {hasMore && (
                  <div ref={loadMoreRef} className="flex justify-center py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchNextPage()}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {isLoadingMore
                        ? t("article.list.loading")
                        : t("article.list.loadMore")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
