import { useLocation } from "@tanstack/react-router";
import { ArrowUpDown, Inbox, Layers, Star } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { isArticleFilter } from "@/lib/article-filter";
import { useGroups } from "@/queries/groups";
import { useFeedLookup, useUnreadCounts } from "@/queries/feeds";
import { useBookmarkLookup } from "@/queries/bookmarks";
import { useUrlState } from "@/hooks/use-url-state";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePreferencesStore, type FeedSort } from "@/store";
import { FeedGroup } from "./feed-group";
import { FeedItem } from "./feed-item";

export function FeedList() {
  const { t } = useI18n();
  const { data: groups = [], isLoading } = useGroups();
  const { feeds } = useFeedLookup();
  const { getTotalUnreadCount } = useUnreadCounts();
  const { total: starredTotal } = useBookmarkLookup();
  const {
    feedSort,
    feedOrder,
    groupOrder,
    setFeedSort,
    setFeedOrder,
    setGroupOrder,
  } = usePreferencesStore();
  const {
    selectedFeedId,
    selectedGroupId,
    articleFilter,
    selectTopLevelFilter,
  } = useUrlState();
  const { pathname } = useLocation();
  const firstPathSegment = pathname.split("/").filter(Boolean)[0];
  const isOnHomePage =
    typeof firstPathSegment === "string" && isArticleFilter(firstPathSegment);
  const isTopLevelSelected =
    isOnHomePage && selectedFeedId === null && selectedGroupId === null;
  const totalUnread = getTotalUnreadCount();
  const starredCount = starredTotal;
  const manualGroupOrder = [
    ...groupOrder.filter((id) => groups.some((group) => group.id === id)),
    ...groups
      .map((group) => group.id)
      .filter((id) => !groupOrder.includes(id)),
  ];
  const groupRank = new Map(
    manualGroupOrder.map((id, index) => [id, index]),
  );
  const sortedGroups = [...groups].sort(
    (a, b) => (groupRank.get(a.id) ?? 0) - (groupRank.get(b.id) ?? 0),
  );
  const manualFeedOrder = [
    ...feedOrder.filter((id) => feeds.some((feed) => feed.id === id)),
    ...feeds
      .map((feed) => feed.id)
      .filter((id) => !feedOrder.includes(id)),
  ];
  const manualRank = new Map(manualFeedOrder.map((id, index) => [id, index]));
  const nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });
  const sortedFeeds = [...feeds].sort((a, b) => {
    if (feedSort === "name") {
      return nameCollator.compare(a.name, b.name);
    }
    if (feedSort === "unread") {
      return (
        b.unread_count - a.unread_count ||
        nameCollator.compare(a.name, b.name)
      );
    }
    if (feedSort === "newest") {
      return b.created_at - a.created_at;
    }

    return (manualRank.get(a.id) ?? 0) - (manualRank.get(b.id) ?? 0);
  });

  const moveFeed = (
    feedId: number,
    direction: "up" | "down",
    siblingIds: number[],
  ) => {
    const currentIndex = siblingIds.indexOf(feedId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetId = siblingIds[targetIndex];
    if (currentIndex < 0 || targetId === undefined) {
      return;
    }

    const nextOrder = [...manualFeedOrder];
    const feedOrderIndex = nextOrder.indexOf(feedId);
    const targetOrderIndex = nextOrder.indexOf(targetId);
    [nextOrder[feedOrderIndex], nextOrder[targetOrderIndex]] = [
      nextOrder[targetOrderIndex],
      nextOrder[feedOrderIndex],
    ];
    setFeedOrder(nextOrder);
  };

  const moveGroup = (groupId: number, direction: "up" | "down") => {
    const currentIndex = manualGroupOrder.indexOf(groupId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || manualGroupOrder[targetIndex] === undefined) {
      return;
    }

    const nextOrder = [...manualGroupOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[currentIndex],
    ];
    setGroupOrder(nextOrder);
  };

  const sortLabels: Record<FeedSort, string> = {
    manual: t("feed.sort.manual"),
    name: t("feed.sort.name"),
    unread: t("feed.sort.unread"),
    newest: t("feed.sort.newest"),
  };

  const topFilters: Array<{
    value: "all" | "unread" | "starred";
    label: string;
    count: number;
    icon: typeof Inbox;
  }> = [
    {
      value: "unread",
      label: t("article.filter.unread"),
      count: totalUnread,
      icon: Inbox,
    },
    {
      value: "starred",
      label: t("article.filter.starred"),
      count: starredCount,
      icon: Star,
    },
    {
      value: "all",
      label: t("article.filter.all"),
      count: totalUnread,
      icon: Layers,
    },
  ];

  if (isLoading && groups.length === 0) {
    return (
      <div className="flex-1 p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-accent" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1 w-full min-w-0 overflow-hidden [&_[data-slot=scroll-area-viewport]>div]:!block">
      <div className="w-full min-w-0 p-2 space-y-0.5">
        {/* Top-level filters */}
        <div className="space-y-0.5">
          {topFilters.map(({ value, label, count, icon: Icon }) => (
            <button
              key={value}
              onClick={() => selectTopLevelFilter(value)}
              className={cn(
                "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors",
                isTopLevelSelected && articleFilter === value
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Feeds header */}
        <div className="mt-2 flex items-center justify-between px-2 py-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("search.group.feeds")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("feed.sort.label")}
                >
                  <ArrowUpDown className="text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={feedSort}
                onValueChange={(value) => setFeedSort(value)}
              >
                <DropdownMenuLabel>{t("feed.sort.label")}</DropdownMenuLabel>
                {Object.entries(sortLabels).map(([value, label]) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Feed groups */}
        <div className="w-full min-w-0 space-y-0.5">
          {sortedGroups.map((group, index) => {
            const groupFeeds = sortedFeeds.filter(
              (feed) => feed.group_id === group.id,
            );

            return (
              <FeedGroup
                key={group.id}
                groupId={group.id}
                name={group.name}
                feeds={groupFeeds}
                canMoveUp={index > 0}
                canMoveDown={index < sortedGroups.length - 1}
                onMoveGroup={(direction) => moveGroup(group.id, direction)}
                manualSorting={feedSort === "manual"}
                onMoveFeed={(feedId, direction) =>
                  moveFeed(
                    feedId,
                    direction,
                    groupFeeds.map((feed) => feed.id),
                  )
                }
              />
            );
          })}

          {/* Ungrouped feeds (group_id = 0) */}
          {sortedFeeds
            .filter((f) => f.group_id === 0)
            .map((feed, index, ungroupedFeeds) => (
              <FeedItem
                key={feed.id}
                feed={feed}
                manualSorting={feedSort === "manual"}
                canMoveUp={index > 0}
                canMoveDown={index < ungroupedFeeds.length - 1}
                onMove={(direction) =>
                  moveFeed(
                    feed.id,
                    direction,
                    ungroupedFeeds.map((item) => item.id),
                  )
                }
              />
            ))}
        </div>
      </div>
    </ScrollArea>
  );
}
