import { memo, useEffect, useMemo, useRef } from "react";
import { Circle, CircleCheck, Star, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate, extractSummary } from "@/lib/utils";
import type { Item } from "@/lib/api";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { toSafeExternalUrl } from "@/lib/safe-url";
import { ArticleExpanded } from "./article-expanded";

interface ArticleItemProps {
	article: Item;
	isSelected: boolean;
	onSelectArticle: (articleId: number | null) => void;
	onToggleRead: (article: Item) => Promise<void>;
	onToggleStar: (article: Item) => Promise<void>;
	onPrefetchArticle: (articleId: number) => void;
	canToggleRead: boolean;
	isStarred: boolean;
	feedName: string;
	feedFaviconUrl: string | null;
}

export const ArticleItem = memo(function ArticleItem({
	article,
	isSelected,
	onSelectArticle,
	onToggleRead,
	onToggleStar,
	onPrefetchArticle,
	canToggleRead,
	isStarred,
	feedName,
	feedFaviconUrl,
}: ArticleItemProps) {
	const rowRef = useRef<HTMLDivElement | null>(null);

	const safeArticleLink = toSafeExternalUrl(article.link);
	const summarySource = article.content_preview ?? article.content;
	const summary = useMemo(
		() => extractSummary(summarySource, 150),
		[summarySource],
	);

	// Bring the expanded article into view (also covers j/k navigation).
	useEffect(() => {
		if (isSelected) {
			rowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, [isSelected]);

	const toggleSelect = () => onSelectArticle(isSelected ? null : article.id);

	const handleToggleRead = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!canToggleRead) return;

		try {
			await onToggleRead(article);
		} catch (error) {
			console.error("Failed to toggle read status:", error);
		}
	};

	const handleToggleStar = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await onToggleStar(article);
		} catch (error) {
			console.error("Failed to toggle star:", error);
		}
	};

	return (
		<div
			ref={rowRef}
			className={cn(
				"relative border-b transition-colors",
				isSelected ? "bg-accent" : "hover:bg-accent/50",
			)}
		>
			{/* Row header: click/keyboard toggles inline expansion */}
			<div
				role="button"
				tabIndex={0}
				onClick={toggleSelect}
				onPointerEnter={() => onPrefetchArticle(article.id)}
				onFocus={() => onPrefetchArticle(article.id)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						toggleSelect();
					}
				}}
				className="group flex w-full cursor-pointer items-start gap-4 px-4 py-4 text-left"
			>
				{/* Article Content */}
				<div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-8">
					<h3
						className={cn(
							"text-lg leading-snug font-medium",
							!isSelected && "line-clamp-2",
							article.unread ? "text-foreground" : "text-muted-foreground",
						)}
					>
						{article.title}
					</h3>
					{!isSelected && (
						<p className="line-clamp-2 text-sm text-muted-foreground">
							{summary}
						</p>
					)}
					<div className="flex items-center gap-2 text-xs">
						<FeedFavicon
							src={feedFaviconUrl}
							className="h-3.5 w-3.5 rounded-sm"
						/>
						<span className="truncate font-medium text-muted-foreground">
							{feedName}
						</span>
						<span className="text-muted-foreground">·</span>
						<span className="shrink-0 text-muted-foreground">
							{formatDate(article.pub_date)}
						</span>
					</div>
				</div>

				{/* Article Actions: read/star on hover, open always visible */}
				<div className="absolute right-2 top-2 flex items-center gap-1">
					<div className="hidden items-center gap-1 group-hover:flex group-focus-within:flex">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleToggleRead}
							disabled={!canToggleRead}
							className={cn(article.unread ? "bg-muted" : "bg-primary/10")}
							aria-label={article.unread ? "标记为已读" : "标记为未读"}
							title={article.unread ? "标记为已读" : "标记为未读"}
						>
							{article.unread ? (
								<Circle className="text-muted-foreground" />
							) : (
								<CircleCheck className="text-primary" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleToggleStar}
							className={cn(
								isStarred ? "bg-amber-100 dark:bg-amber-950/40" : "bg-muted",
							)}
							aria-label={isStarred ? "取消收藏" : "收藏"}
							title={isStarred ? "取消收藏" : "收藏"}
						>
							<Star
								className={cn(
									isStarred
										? "fill-amber-500 text-amber-500"
										: "text-muted-foreground",
								)}
							/>
						</Button>
					</div>
					{safeArticleLink ? (
						<Button
							render={
								<a
									href={safeArticleLink}
									target="_blank"
									rel="noopener noreferrer"
									onClick={(e) => e.stopPropagation()}
								/>
							}
							variant="ghost"
							size="icon-sm"
							className="bg-muted"
							aria-label="在浏览器中打开"
							title="在浏览器中打开"
						>
							<ExternalLink className="text-muted-foreground" />
						</Button>
					) : (
						<Button
							variant="ghost"
							size="icon-sm"
							disabled
							className="bg-muted"
							aria-label="在浏览器中打开"
							title="在浏览器中打开"
						>
							<ExternalLink className="text-muted-foreground" />
						</Button>
					)}
				</div>
			</div>

			{isSelected && (
				<ArticleExpanded article={article} articleId={article.id} />
			)}
		</div>
	);
});
