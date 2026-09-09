import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Keyboard, Loader2, Search, Settings } from "lucide-react";
import { getFaviconUrl } from "@/lib/api/favicon";
import { searchAPI } from "@/lib/api";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store";
import { useFeedLookup } from "@/queries/feeds";
import { useUrlState } from "@/hooks/use-url-state";
import { formatDate } from "@/lib/utils";
import { FeedFavicon } from "@/components/feed/feed-favicon";

export function SearchDialog() {
  const { isSearchOpen, setSearchOpen, setEditFeedOpen, setShortcutsOpen } =
    useUIStore();
  const { getFeedById } = useFeedLookup();
  const { setSelectedFeed, setSelectedArticle } = useUrlState();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = query.trim();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(normalizedQuery), 200);
    return () => clearTimeout(timer);
  }, [normalizedQuery]);

  const search = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: ({ signal }) => searchAPI.search(debouncedQuery, 10, signal),
    enabled:
      isSearchOpen &&
      Boolean(debouncedQuery) &&
      normalizedQuery === debouncedQuery,
    retry: false,
  });
  const waiting = normalizedQuery !== debouncedQuery;
  const loading = Boolean(normalizedQuery) && (waiting || search.isFetching);
  const failed = !waiting && search.isError;
  const feeds =
    waiting || !normalizedQuery ? [] : (search.data?.data?.feeds ?? []);
  const items =
    waiting || !normalizedQuery ? [] : (search.data?.data?.items ?? []);

  const handleSelectFeed = (feedId: number) => {
    setSelectedFeed(feedId);
    setSearchOpen(false);
  };

  const handleEditFeed = (e: React.MouseEvent, feedId: number) => {
    e.stopPropagation();
    const fullFeed = getFeedById(feedId);
    if (fullFeed) {
      setSearchOpen(false);
      setEditFeedOpen(true, fullFeed);
    }
  };

  const handleSelectArticle = (articleId: number) => {
    setSelectedArticle(articleId);
    setSearchOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
    setSearchOpen(open);
  };

  const handleOpenShortcuts = () => {
    setSearchOpen(false);
    setShortcutsOpen(true);
  };

  return (
    <Dialog open={isSearchOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>搜索</DialogTitle>
          <DialogDescription>搜索订阅源和文章</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="搜索订阅源和文章..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && query.trim() && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {failed && !loading && (
              <div
                role="alert"
                className="flex flex-col items-center gap-3 py-6"
              >
                <p className="text-sm text-muted-foreground">
                  搜索失败，请检查网络后重试。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void search.refetch()}
                >
                  重试搜索
                </Button>
              </div>
            )}
            {!loading &&
              !failed &&
              debouncedQuery &&
              feeds.length === 0 &&
              items.length === 0 && <CommandEmpty>未找到结果。</CommandEmpty>}

            {feeds.length > 0 && (
              <CommandGroup heading="订阅源">
                {feeds.map((feed) => (
                  <CommandItem
                    key={`feed-${feed.id}`}
                    value={`feed-${feed.id}`}
                    onSelect={() => handleSelectFeed(feed.id)}
                    className="group gap-2"
                  >
                    <FeedFavicon
                      src={getFaviconUrl(feed.link, feed.site_url)}
                      className="h-4 w-4 rounded-sm"
                    />
                    <span className="flex-1 truncate">{feed.name}</span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={(e) => handleEditFeed(e, feed.id)}
                      aria-label="编辑订阅"
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {feeds.length > 0 && items.length > 0 && <CommandSeparator />}

            {items.length > 0 && (
              <CommandGroup heading="文章">
                {items.map((article) => {
                  const feed = getFeedById(article.feed_id);
                  return (
                    <CommandItem
                      key={`article-${article.id}`}
                      value={`article-${article.id}`}
                      onSelect={() => handleSelectArticle(article.id)}
                      className="flex-col items-start gap-1"
                    >
                      <div className="flex w-full items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{article.title}</span>
                      </div>
                      <div className="flex w-full items-center gap-2 pl-6 text-xs text-muted-foreground">
                        <span>{feed?.name ?? "未知订阅源"}</span>
                        <span>·</span>
                        <span>{formatDate(article.pub_date)}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {!debouncedQuery && !loading && (
              <CommandGroup heading="快捷操作">
                <CommandItem className="gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span>输入关键词以搜索订阅源和文章</span>
                </CommandItem>
                <CommandItem
                  className="justify-between gap-2"
                  onSelect={handleOpenShortcuts}
                >
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-4 w-4 text-muted-foreground" />
                    <span>键盘快捷键</span>
                  </div>
                  <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                    ?
                  </kbd>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
