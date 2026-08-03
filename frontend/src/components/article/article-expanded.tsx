import {
	ChevronUp,
	Circle,
	CircleCheck,
	ExternalLink,
	Star,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { useArticleList } from "@/hooks/use-article-list";
import { useUrlState } from "@/hooks/use-url-state";
import type { Item } from "@/lib/api";
import { getFaviconUrl } from "@/lib/api/favicon";
import { processArticleContent } from "@/lib/content";
import { toSafeExternalUrl } from "@/lib/safe-url";
import { formatDate } from "@/lib/utils";
import { useFeedLookup } from "@/queries/feeds";
import { useCreateBookmark, useDeleteBookmark } from "@/queries/bookmarks";
import { useItem, useMarkItemsRead, useMarkItemsUnread } from "@/queries/items";

interface ArticleExpandedProps {
	// List-row data when expanded inline; null when the selected article is not
	// part of the loaded list (e.g. opened from search) and must be fetched.
	article: Item | null;
	articleId: number;
}

export function ArticleExpanded({ article, articleId }: ArticleExpandedProps) {
	const {
		articleFilter,
		selectedFeedId,
		selectedGroupId,
		setSelectedArticle,
		setSelectedFeed,
	} = useUrlState();
	const { getFeedById } = useFeedLookup();
	const { isStarredMode, isItemStarred, getBookmarkByItemId } = useArticleList({
		feedId: selectedFeedId,
		groupId: selectedGroupId,
		articleFilter,
	});

	const markRead = useMarkItemsRead();
	const markUnread = useMarkItemsUnread();
	const createBookmark = useCreateBookmark();
	const deleteBookmark = useDeleteBookmark();

	const hasFullListContent = Boolean(article?.content);
	const shouldFetch =
		articleId > 0 && (isStarredMode || article === null || !hasFullListContent);
	const {
		data: fetchedArticle,
		isLoading: isArticleLoading,
		isError: isArticleError,
		refetch: refetchArticle,
	} = useItem(articleId, shouldFetch);

	const resolved: Item | null = isStarredMode
		? (fetchedArticle ?? article)
		: hasFullListContent
			? article
			: (fetchedArticle ?? null);

	const starred = resolved ? isItemStarred(resolved.id) : false;
	const feed = resolved ? getFeedById(resolved.feed_id) : null;
	const bookmark = resolved ? getBookmarkByItemId(resolved.id) : null;
	const safeArticleLink = resolved ? toSafeExternalUrl(resolved.link) : null;
	const processedArticleContent = useMemo(() => {
		const content = resolved?.content ?? "";
		return content
			? processArticleContent(content, safeArticleLink ?? undefined)
			: "";
	}, [resolved?.content, safeArticleLink]);

	// Auto-mark as read on expand, except in unread mode where the row would
	// immediately disappear from the filtered list while being read.
	const autoMarkRead = articleFilter !== "unread";
	const autoReadIdRef = useRef<number | null>(null);
	useEffect(() => {
		if (
			!autoMarkRead ||
			!resolved ||
			resolved.id <= 0 ||
			autoReadIdRef.current === resolved.id ||
			!resolved.unread
		) {
			return;
		}

		autoReadIdRef.current = resolved.id;
		void markRead.mutateAsync([resolved.id]).catch((error) => {
			console.error("Failed to automatically mark article as read:", error);
		});
	}, [autoMarkRead, markRead, resolved]);

	const canToggleRead = resolved !== null && resolved.id > 0;

	const handleToggleRead = async () => {
		if (!resolved || !canToggleRead) return;
		try {
			if (resolved.unread) {
				await markRead.mutateAsync([resolved.id]);
			} else {
				await markUnread.mutateAsync([resolved.id]);
			}
		} catch (error) {
			console.error("Failed to toggle read status:", error);
		}
	};

	const handleToggleStar = async () => {
		if (!resolved || createBookmark.isPending || deleteBookmark.isPending) {
			return;
		}

		try {
			if (starred) {
				const existing = getBookmarkByItemId(resolved.id);
				if (existing && existing.id > 0) {
					await deleteBookmark.mutateAsync(existing.id);
				}
			} else {
				await createBookmark.mutateAsync(resolved);
			}
		} catch (error) {
			console.error("Failed to toggle star:", error);
		}
	};

	const getLinkDomain = (url: string) => {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	};

	if (!resolved) {
		return (
			<div className="border-t px-4 py-4 sm:px-6">
				{isArticleLoading ? (
					<div className="space-y-5 py-2">
						<div className="h-8 w-3/4 animate-pulse rounded bg-accent" />
						<div className="h-4 w-1/3 animate-pulse rounded bg-accent" />
						<div className="space-y-3 pt-2">
							<div className="h-4 animate-pulse rounded bg-accent" />
							<div className="h-4 animate-pulse rounded bg-accent" />
							<div className="h-4 w-5/6 animate-pulse rounded bg-accent" />
						</div>
					</div>
				) : isArticleError ? (
					<div className="flex flex-col items-center gap-3 py-6 text-center">
						<p className="text-sm text-muted-foreground">文章加载失败</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void refetchArticle()}
						>
							刷新
						</Button>
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div className="border-t px-4 pb-6 sm:px-6">
			{/* Action toolbar */}
			<div className="flex items-center justify-between gap-2 py-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleToggleRead()}
						disabled={!canToggleRead}
						className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
					>
						{resolved.unread ? (
							<Circle className="h-4 w-4 text-muted-foreground" />
						) : (
							<CircleCheck className="h-4 w-4 text-primary" />
						)}
						{resolved.unread ? "标记为已读" : "标记为未读"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleToggleStar()}
						disabled={createBookmark.isPending || deleteBookmark.isPending}
						className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
					>
						<Star
							className={`h-4 w-4 ${starred ? "fill-current text-amber-500" : ""}`}
						/>
						{starred ? "取消收藏" : "收藏"}
					</Button>
					<Button
						render={
							safeArticleLink ? (
								<a
									href={safeArticleLink}
									target="_blank"
									rel="noopener noreferrer"
								/>
							) : undefined
						}
						variant="outline"
						size="sm"
						disabled={!safeArticleLink}
						className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
					>
						<ExternalLink className="h-4 w-4" />
						原文
					</Button>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => setSelectedArticle(null)}
					aria-label="收起"
					title="收起"
				>
					<ChevronUp className="h-[18px] w-[18px] text-muted-foreground" />
				</Button>
			</div>

			{/* Title and metadata */}
			<div className="space-y-3">
				<h1 className="text-[28px] font-bold leading-[1.3]">
					{resolved.title}
				</h1>
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
					{resolved.feed_id > 0 ? (
						<button
							type="button"
							onClick={() => setSelectedFeed(resolved.feed_id)}
							className="flex max-w-48 items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
						>
							{feed && (
								<FeedFavicon
									src={getFaviconUrl(feed.link, feed.site_url)}
									className="h-3.5 w-3.5 rounded-sm"
								/>
							)}
							<span className="truncate hover:underline">
								{feed?.name ?? bookmark?.feed_name ?? "未知"}
							</span>
						</button>
					) : (
						<span className="flex max-w-48 items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
							<span className="truncate">{bookmark?.feed_name ?? "未知"}</span>
						</span>
					)}
					<span className="text-muted-foreground">
						{formatDate(resolved.pub_date)}
					</span>
					{safeArticleLink ? (
						<a
							href={safeArticleLink}
							target="_blank"
							rel="noopener noreferrer"
							className="truncate text-primary hover:underline"
						>
							{getLinkDomain(safeArticleLink)}
						</a>
					) : null}
				</div>
			</div>

			<div
				className="typeset typeset-article mt-4 min-w-0 max-w-none"
				dangerouslySetInnerHTML={{
					__html: processedArticleContent,
				}}
			/>
		</div>
	);
}
