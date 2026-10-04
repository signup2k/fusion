import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Menu,
  Moon,
  RefreshCw,
  Rss,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PublicSourceNav } from "./public-source-nav";
import { processArticleContent } from "@/lib/content";
import { publicAPI, PublicAPIError, type PublicFeed, type PublicItem, type PublicScope } from "@/lib/public-api";
import { toSafeExternalUrl } from "@/lib/safe-url";
import { cn, extractSummary, formatDate } from "@/lib/utils";

const REFRESH_INTERVAL = 60_000;
const WINDOW_SECONDS = 7 * 24 * 60 * 60;
const ALL_SOURCES: PublicScope = { kind: "all" };

export function PublicReader() {
  const [selectedScope, setSelectedScope] = useState<PublicScope>(ALL_SOURCES);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const feeds = useQuery({
    queryKey: ["public", "feeds"],
    queryFn: ({ signal }) => publicAPI.feeds(signal),
    refetchInterval: REFRESH_INTERVAL,
  });
  const sources = useMemo(() => feeds.data?.data ?? [], [feeds.data]);
  const groups = useMemo(() => feeds.data?.groups ?? [], [feeds.data]);
  const sourcesById = useMemo(() => new Map(sources.map((feed) => [feed.id, feed])), [sources]);
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const scope = selectedScope.kind === "feed" && !sourcesById.has(selectedScope.id)
    || selectedScope.kind === "group" && !groupsById.has(selectedScope.id)
    ? ALL_SOURCES : selectedScope;
  const scopeName = scope.kind === "feed" ? sourcesById.get(scope.id)?.name
    : scope.kind === "group" ? groupsById.get(scope.id)?.name : "全部订阅源";
  const items = useInfiniteQuery({
    queryKey: ["public", "items", scope.kind, scope.kind === "all" ? 0 : scope.id],
    queryFn: ({ pageParam, signal }) => publicAPI.items(scope, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: REFRESH_INTERVAL,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const articles = useMemo(
    () => items.data?.pages.flatMap((page) => page.data).filter(
      (item) => item.pub_date >= now - WINDOW_SECONDS && item.pub_date <= now,
    ) ?? [],
    [items.data, now],
  );
  const isRefreshing = feeds.isFetching || items.isFetching;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["public"] });
  const selectScope = (next: PublicScope) => {
    setSelectedScope(next);
    setExpandedId(null);
    setSourceMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const sourceNavigation = (
    <>
      {feeds.isPending && <p role="status" className="p-4 text-sm text-muted-foreground">正在加载订阅源…</p>}
      {feeds.isError && (
        <div role="alert" className="m-3 rounded-lg bg-muted p-3 text-sm">
          <p className="mb-3">订阅源加载失败，请重试。</p>
          <Button variant="outline" size="sm" onClick={() => void feeds.refetch()}>重试</Button>
        </div>
      )}
      <PublicSourceNav groups={groups} feeds={sources} scope={scope} onSelect={selectScope} />
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="打开订阅源分组" />}>
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(20rem,85vw)] gap-0" showCloseButton={false}>
                <SheetHeader className="border-b">
                  <SheetTitle>订阅源分组</SheetTitle>
                  <SheetDescription>选择分组或订阅源查看最近 7 天的文章。</SheetDescription>
                  <Button variant="ghost" size="sm" className="mt-2 self-start" onClick={() => setSourceMenuOpen(false)}>关闭分组列表</Button>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">{sourceNavigation}</div>
              </SheetContent>
            </Sheet>
            <img src="/icon-96.png" alt="" width={36} height={36} className="hidden size-9 rounded-lg sm:block" />
            <div>
              <h1 className="text-base font-semibold"><span className="hidden sm:inline">Fusion </span><span className="font-normal text-muted-foreground">公开阅读</span></h1>
              <p className="mt-0.5 text-xs text-muted-foreground">最近 7 天<span className="hidden sm:inline"> · 最新文章在前</span></p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="刷新内容" title="刷新内容" onClick={() => void refresh()} disabled={isRefreshing}>
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="切换明暗主题" title="切换明暗主题" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-label="订阅源" className="sticky top-16 hidden h-[calc(100dvh-4rem)] overflow-y-auto border-r md:block">
          {sourceNavigation}
        </aside>
        <main className="min-w-0 px-4 pb-12 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b py-5">
            <div className="flex min-w-0 items-center gap-2">
              <Rss className="size-4 shrink-0 text-muted-foreground" />
              <h2 className="min-w-0 break-words text-sm font-medium">{scopeName}</h2>
            </div>
            <p className="text-xs text-muted-foreground">内容自动更新 · 无需登录</p>
          </div>

          {items.isPending ? (
            <div role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />正在加载文章…
            </div>
          ) : items.isError && !items.data ? (
            <div role="alert" className="py-20 text-center">
              <p className="mb-4 text-sm text-muted-foreground">文章加载失败，请重试。</p>
              <Button variant="outline" onClick={() => void items.refetch()}>重新加载</Button>
            </div>
          ) : (
            <>
              {items.isRefetchError && (
                <div role="alert" className="pt-4 text-sm text-muted-foreground">内容更新失败，请点击顶部刷新按钮重试。</div>
              )}
              {articles.length === 0 ? (
                <div className="py-20 text-center">
                  <Rss className="mx-auto mb-4 size-8 text-muted-foreground/60" />
                  <h2 className="text-base font-medium">最近 7 天还没有文章</h2>
                  <p className="mt-2 text-sm text-muted-foreground">订阅源的新内容抓取后会自动显示在这里。</p>
                </div>
              ) : (
                <div className="divide-y">
                  {articles.map((article) => (
                    <PublicArticle
                      key={article.id}
                      article={article}
                      feed={sourcesById.get(article.feed_id)}
                      expanded={expandedId === article.id}
                      onToggle={() => setExpandedId(expandedId === article.id ? null : article.id)}
                    />
                  ))}
                </div>
              )}
              {items.hasNextPage && (
                <div className="pt-6 text-center">
                  {items.isFetchNextPageError && <p role="alert" className="mb-3 text-sm text-muted-foreground">更多文章加载失败，请重试。</p>}
                  <Button variant="outline" disabled={items.isFetching} onClick={() => void items.fetchNextPage()}>
                    {items.isFetchingNextPage ? <><LoaderCircle className="size-4 animate-spin" />正在加载…</> : "加载更多"}
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PublicArticle({ article, feed, expanded, onToggle }: {
  article: PublicItem;
  feed?: PublicFeed;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = useMemo(() => extractSummary(article.content_preview ?? "", 160), [article.content_preview]);
  const detail = useQuery({
    queryKey: ["public", "item", article.id],
    queryFn: ({ signal }) => publicAPI.item(article.id, signal),
    enabled: expanded,
    refetchInterval: expanded ? REFRESH_INTERVAL : false,
    retry: (count, error) => !(error instanceof PublicAPIError && error.status === 404) && count < 1,
  });
  const link = toSafeExternalUrl(article.link);
  const content = useMemo(() => processArticleContent(detail.data?.data.content ?? "", link ?? undefined, true), [detail.data, link]);
  const unavailable = detail.error instanceof PublicAPIError && detail.error.status === 404;
  const panelId = `public-article-${article.id}`;

  return (
    <article className="py-1">
      <button
        className="flex w-full items-start gap-3 rounded-lg px-2 py-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:px-3"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-relaxed font-medium sm:text-lg">{article.title || "无标题文章"}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{feed?.name ?? "订阅源"}</span>
            <time dateTime={new Date(article.pub_date * 1000).toISOString()} title={new Date(article.pub_date * 1000).toLocaleString("zh-CN")}>
              {formatDate(article.pub_date)}
            </time>
          </div>
          {!expanded && summary && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{summary}</p>}
        </div>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <section id={panelId} aria-label="文章内容" className="px-2 pb-6 sm:px-3">
          {detail.isPending ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">正在加载正文…</p>
          ) : detail.isError ? (
            <div role="alert" className="py-6 text-sm text-muted-foreground">
              <p>{unavailable ? "这篇文章已移出公开阅读范围。" : "正文加载失败，请重试。"}</p>
              {!unavailable && <Button className="mt-3" variant="outline" size="sm" onClick={() => void detail.refetch()}>重试</Button>}
            </div>
          ) : content ? (
            <div className="typeset typeset-article mx-auto mt-4 min-w-0 max-w-[72ch]" dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            <p className="py-6 text-sm text-muted-foreground">此订阅源没有提供正文，可前往原文阅读。</p>
          )}
          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-sm">
            <button className="rounded px-2 py-1 text-muted-foreground hover:text-foreground" onClick={onToggle}>收起正文</button>
            {link && !unavailable && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-primary hover:underline">
                查看原文<ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </section>
      )}
    </article>
  );
}
