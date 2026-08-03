import { useMemo, useState } from "react";
import { createLazyFileRoute } from "@tanstack/react-router";
import {
	ChevronDown,
	Download,
	Folder,
	ListFilter,
	Plus,
	RefreshCw,
	Rss,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { feedAPI, groupAPI } from "@/lib/api";
import type { Feed, Group } from "@/lib/api";
import { generateOPML, downloadFile } from "@/lib/opml";
import { cn } from "@/lib/utils";
import {
	useFeedLookup,
	useCheckFeed,
	useDeleteFeeds,
	useMoveFeedsToGroup,
	useRefreshFeed,
	useRefreshFeeds,
} from "@/queries/feeds";
import { useDeleteGroup, useGroups, useUpdateGroup } from "@/queries/groups";
import { useUIStore } from "@/store";
import { FeedGroupCard } from "@/components/feed/feed-group-card";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createLazyFileRoute("/feeds")({
	component: FeedsPage,
});

type StatusFilter = "all" | "error" | "paused";

function FeedsPage() {
	const { data: groups = [] } = useGroups();
	const { feeds, getFeedsByGroup, isLoading: isFeedsLoading } = useFeedLookup();
	const updateGroupMutation = useUpdateGroup();
	const deleteGroupMutation = useDeleteGroup();
	const moveFeedsMutation = useMoveFeedsToGroup();
	const refreshFeedsMutation = useRefreshFeeds();
	const refreshFeedMutation = useRefreshFeed();
	const checkFeedMutation = useCheckFeed();
	const deleteFeedsMutation = useDeleteFeeds();

	const {
		setEditFeedOpen,
		setImportOpmlOpen,
		setAddFeedOpen,
		setAddGroupOpen,
	} = useUIStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [isExporting, setIsExporting] = useState(false);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(
		new Set(),
	);

	const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
	const [editingGroupName, setEditingGroupName] = useState("");

	const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
	const [isSelectingFeeds, setIsSelectingFeeds] = useState(false);
	const [selectedFeedIds, setSelectedFeedIds] = useState<Set<number>>(
		new Set(),
	);
	const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
	const [mobileErrorTooltipFeedId, setMobileErrorTooltipFeedId] = useState<
		number | null
	>(null);
	const isMobile = useIsMobile();

	const statusFilterLabels: Record<StatusFilter, string> = {
		all: "全部状态",
		error: "错误",
		paused: "已暂停",
	};

	const isFiltering = searchQuery.trim() !== "" || statusFilter !== "all";

	const groupedFeeds = useMemo(() => {
		const query = searchQuery.toLowerCase().trim();

		const matchesFeed = (feed: Feed) => {
			if (
				query &&
				!feed.name.toLowerCase().includes(query) &&
				!feed.link.toLowerCase().includes(query)
			) {
				return false;
			}
			if (statusFilter === "error" && !feed.fetch_state.last_error)
				return false;
			if (statusFilter === "paused" && !feed.suspended) return false;
			return true;
		};

		return groups.map((group) => ({
			group,
			feeds: getFeedsByGroup(group.id).filter(matchesFeed),
		}));
	}, [groups, searchQuery, statusFilter, getFeedsByGroup]);

	const toggleGroup = (groupId: number) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) {
				next.delete(groupId);
			} else {
				next.add(groupId);
			}
			return next;
		});
	};

	const handleRefreshAll = async () => {
		const refreshPromise = refreshFeedsMutation.mutateAsync();
		toast.success("正在刷新所有订阅...");
		try {
			await refreshPromise;
		} catch {
			toast.error("刷新订阅失败");
		}
	};

	const handleRefreshFeed = async (feed: Feed) => {
		const refreshPromise = refreshFeedMutation.mutateAsync(feed.id);
		toast.success(`正在刷新“${feed.name}”...`);
		try {
			await refreshPromise;
		} catch {
			toast.error(`刷新“${feed.name}”失败`);
		}
	};

	const handleCheckFeed = async (feed: Feed) => {
		try {
			const result = await checkFeedMutation.mutateAsync(feed.id);
			if (result.healthy) {
				toast.success(
					`“${feed.name}”检测正常（HTTP ${result.http_status}，${result.item_count} 个条目）`,
				);
			} else {
				toast.error(`“${feed.name}”检测失败：${result.error ?? "未知"}`);
			}
		} catch {
			toast.error(`“${feed.name}”检测失败：未知`);
		}
	};

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const [groupsRes, feedsRes] = await Promise.all([
				groupAPI.list(),
				feedAPI.list(),
			]);
			const opml = generateOPML(groupsRes.data, feedsRes.data);
			downloadFile(opml, "fusion-subscriptions.opml", "application/xml");
			toast.success("OPML 导出成功");
		} catch {
			toast.error("导出 OPML 失败");
		} finally {
			setIsExporting(false);
		}
	};

	const startEditingGroup = (group: Group) => {
		setEditingGroupId(group.id);
		setEditingGroupName(group.name);
	};

	const saveGroupName = async (group: Group) => {
		const name = editingGroupName.trim();
		setEditingGroupId(null);
		if (!name || name === group.name) return;

		try {
			await updateGroupMutation.mutateAsync({ id: group.id, name });
			toast.success("分组已重命名");
		} catch {
			toast.error("重命名分组失败");
		}
	};

	const confirmDeleteGroup = async () => {
		if (!deletingGroup) return;

		setIsDeleting(true);
		try {
			await moveFeedsMutation.mutateAsync({
				fromGroupId: deletingGroup.id,
				toGroupId: 1,
			});
			await deleteGroupMutation.mutateAsync(deletingGroup.id);

			toast.success("分组已删除");
			setDeletingGroup(null);
		} catch {
			toast.error("删除分组失败");
		} finally {
			setIsDeleting(false);
		}
	};

	const visibleGroups = groupedFeeds.filter(
		({ feeds: gf }) => gf.length > 0 || !isFiltering,
	);

	const totalVisible = groupedFeeds.reduce((sum, g) => sum + g.feeds.length, 0);
	const hasNoFeeds = !isFeedsLoading && feeds.length === 0;
	const visibleFeedIds = useMemo(
		() =>
			groupedFeeds.flatMap(({ feeds: groupFeeds }) =>
				groupFeeds.map((feed) => feed.id),
			),
		[groupedFeeds],
	);
	const allVisibleSelected =
		visibleFeedIds.length > 0 &&
		visibleFeedIds.every((feedId) => selectedFeedIds.has(feedId));

	const toggleFeedSelection = (feedId: number) => {
		setSelectedFeedIds((current) => {
			const next = new Set(current);
			if (next.has(feedId)) next.delete(feedId);
			else next.add(feedId);
			return next;
		});
	};

	const toggleAllVisibleFeeds = () => {
		setSelectedFeedIds((current) => {
			const next = new Set(current);
			if (allVisibleSelected) {
				visibleFeedIds.forEach((feedId) => next.delete(feedId));
			} else {
				visibleFeedIds.forEach((feedId) => next.add(feedId));
			}
			return next;
		});
	};

	const exitFeedSelection = () => {
		setIsSelectingFeeds(false);
		setSelectedFeedIds(new Set());
	};

	const confirmBatchDelete = async () => {
		const ids = [...selectedFeedIds];
		if (ids.length === 0) return;
		try {
			await deleteFeedsMutation.mutateAsync(ids);
			toast.success(`已删除 ${ids.length} 个订阅`);
			setBatchDeleteConfirmOpen(false);
			exitFeedSelection();
		} catch {
			toast.error("批量删除订阅失败，请检查后重试");
		}
	};
	const deletingGroupMoveHint = useMemo(() => {
		if (!deletingGroup) {
			return "";
		}

		const count = feeds.filter(
			(feed) => feed.group_id === deletingGroup.id,
		).length;
		if (count === 0) {
			return "";
		}

		const target = groups.find((group) => group.id === 1);
		return `该分组内所有订阅（${count}）将移动到 ${target?.name ?? "默认分组"}。`;
	}, [deletingGroup, feeds, groups]);

	return (
		<AppLayout>
			<div className="flex h-full min-h-0 flex-col overflow-hidden">
				<ContentHeader>
					<div className="flex items-center gap-1">
						<SidebarTrigger />
						<h1 className="text-lg font-semibold">管理订阅</h1>
					</div>
					<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<Rss className="h-4 w-4" />
						<span className="font-medium">订阅数：{feeds.length}</span>
					</div>
				</ContentHeader>

				<div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<div className="flex items-center gap-2">
						<div className="relative flex-1 sm:flex-initial">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="搜索订阅..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-9 w-full pl-9 sm:w-[280px]"
								name="feed-search"
								autoComplete="off"
								aria-label="搜索订阅..."
							/>
						</div>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="outline"
										size="sm"
										className="shrink-0 gap-1.5"
									>
										<ListFilter className="h-3.5 w-3.5" />
										<span className="hidden sm:inline">
											{statusFilterLabels[statusFilter]}
										</span>
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
									</Button>
								}
							/>
							<DropdownMenuContent align="start">
								{(Object.keys(statusFilterLabels) as StatusFilter[]).map(
									(key) => (
										<DropdownMenuItem
											key={key}
											onClick={() => setStatusFilter(key)}
										>
											{statusFilterLabels[key]}
										</DropdownMenuItem>
									),
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button size="sm">
										<Plus className="mr-1.5 h-3.5 w-3.5" />
										添加
										<ChevronDown className="ml-1 h-3.5 w-3.5" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setAddFeedOpen(true)}>
									<Rss className="mr-2 h-4 w-4" />
									添加订阅
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setAddGroupOpen(true)}>
									<Folder className="mr-2 h-4 w-4" />
									添加分组
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						{isSelectingFeeds ? (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={toggleAllVisibleFeeds}
								>
									{allVisibleSelected ? "取消全选" : "全选当前结果"}
								</Button>
								<Button
									variant="destructive"
									size="sm"
									disabled={selectedFeedIds.size === 0}
									onClick={() => setBatchDeleteConfirmOpen(true)}
								>
									<Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
									删除所选（{selectedFeedIds.size}）
								</Button>
								<Button variant="outline" size="sm" onClick={exitFeedSelection}>
									取消
								</Button>
							</>
						) : (
							<Button
								variant="outline"
								size="sm"
								disabled={feeds.length === 0}
								onClick={() => setIsSelectingFeeds(true)}
							>
								<Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
								<span className="hidden sm:inline">批量删除</span>
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setRefreshConfirmOpen(true)}
							disabled={refreshFeedsMutation.isPending}
						>
							<RefreshCw
								className={cn(
									"h-3.5 w-3.5 sm:mr-1.5",
									refreshFeedsMutation.isPending && "animate-spin",
								)}
							/>
							<span className="hidden sm:inline">刷新全部</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setImportOpmlOpen(true)}
						>
							<Upload className="h-3.5 w-3.5 sm:mr-1.5" />
							<span className="hidden sm:inline">导入</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleExport}
							disabled={isExporting}
						>
							<Download className="h-3.5 w-3.5 sm:mr-1.5" />
							<span className="hidden sm:inline">
								{isExporting ? "导出中..." : "导出"}
							</span>
						</Button>
					</div>
				</div>

				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-2 p-4 sm:p-6">
						{hasNoFeeds ? (
							<div className="py-12 text-center text-sm text-muted-foreground">
								暂无订阅。请使用上方“添加”创建第一个订阅。
							</div>
						) : (
							<>
								{visibleGroups.map(({ group, feeds: groupFeeds }) => {
									const isCollapsed = collapsedGroups.has(group.id);
									const isEditing = editingGroupId === group.id;

									return (
										<FeedGroupCard
											key={group.id}
											group={group}
											groupFeeds={groupFeeds}
											isCollapsed={isCollapsed}
											isEditing={isEditing}
											editingGroupName={editingGroupName}
											isMobile={isMobile}
											mobileErrorTooltipFeedId={mobileErrorTooltipFeedId}
											onToggleGroup={toggleGroup}
											onStartEditingGroup={startEditingGroup}
											onChangeEditingGroupName={setEditingGroupName}
											onSaveGroupName={(targetGroup) => {
												void saveGroupName(targetGroup);
											}}
											onCancelEditingGroup={() => setEditingGroupId(null)}
											onOpenAddFeed={() => setAddFeedOpen(true)}
											onOpenDeleteGroup={setDeletingGroup}
											onOpenEditFeed={(feed) => setEditFeedOpen(true, feed)}
											onRefreshFeed={(feed) => void handleRefreshFeed(feed)}
											onCheckFeed={(feed) => void handleCheckFeed(feed)}
											isSelecting={isSelectingFeeds}
											selectedFeedIds={selectedFeedIds}
											onToggleFeedSelection={toggleFeedSelection}
											refreshingFeedId={
												refreshFeedMutation.isPending
													? (refreshFeedMutation.variables ?? null)
													: null
											}
											checkingFeedId={
												checkFeedMutation.isPending
													? (checkFeedMutation.variables ?? null)
													: null
											}
											onChangeMobileErrorTooltipFeedId={
												setMobileErrorTooltipFeedId
											}
										/>
									);
								})}

								{visibleGroups.length === 0 && (
									<div className="py-12 text-center text-sm text-muted-foreground">
										没有符合筛选条件的订阅
									</div>
								)}

								{isFiltering &&
									visibleGroups.length > 0 &&
									totalVisible === 0 && (
										<div className="py-12 text-center text-sm text-muted-foreground">
											没有符合筛选条件的订阅
										</div>
									)}
							</>
						)}
					</div>
				</ScrollArea>
			</div>

			<Dialog
				open={deletingGroup !== null}
				onOpenChange={(open) => !open && setDeletingGroup(null)}
			>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>删除分组</DialogTitle>
						<DialogDescription>
							确定要删除“{deletingGroup?.name ?? ""}”吗？
							{deletingGroupMoveHint ? ` ${deletingGroupMoveHint}` : ""}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeletingGroup(null)}
							disabled={isDeleting}
						>
							取消
						</Button>
						<Button
							variant="destructive"
							onClick={confirmDeleteGroup}
							disabled={isDeleting}
						>
							{isDeleting ? "删除中..." : "删除"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={refreshConfirmOpen} onOpenChange={setRefreshConfirmOpen}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>刷新全部订阅</DialogTitle>
						<DialogDescription>
							将刷新全部 {feeds.length} 个订阅，是否继续？
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRefreshConfirmOpen(false)}
						>
							取消
						</Button>
						<Button
							onClick={() => {
								setRefreshConfirmOpen(false);
								handleRefreshAll();
							}}
						>
							刷新
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={batchDeleteConfirmOpen}
				onOpenChange={setBatchDeleteConfirmOpen}
			>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>批量删除订阅</DialogTitle>
						<DialogDescription>
							确定要删除所选的 {selectedFeedIds.size}{" "}
							个订阅吗？这些订阅下的所有文章也会被删除。
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setBatchDeleteConfirmOpen(false)}
							disabled={deleteFeedsMutation.isPending}
						>
							取消
						</Button>
						<Button
							variant="destructive"
							onClick={() => void confirmBatchDelete()}
							disabled={deleteFeedsMutation.isPending}
						>
							{deleteFeedsMutation.isPending ? "删除中..." : "删除"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</AppLayout>
	);
}
