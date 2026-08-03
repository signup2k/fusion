import { useState, useEffect, useRef } from "react";
import { AlertCircle, ChevronDown, Save, Trash2, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUIStore } from "@/store";
import { useGroups } from "@/queries/groups";
import { useUpdateFeed, useDeleteFeed } from "@/queries/feeds";
import type { UpdateFeedRequest } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function EditFeedDialog() {
	const { isEditFeedOpen, editingFeed, setEditFeedOpen } = useUIStore();
	const { data: groups = [] } = useGroups();
	const updateFeedMutation = useUpdateFeed();
	const deleteFeedMutation = useDeleteFeed();

	const [url, setUrl] = useState("");
	const [name, setName] = useState("");
	const [groupId, setGroupId] = useState<string>("");
	const [proxy, setProxy] = useState("");
	const [suspended, setSuspended] = useState(false);
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isMobileErrorTooltipOpen, setIsMobileErrorTooltipOpen] =
		useState(false);
	const urlInputRef = useRef<HTMLInputElement>(null);
	const isMobile = useIsMobile();

	useEffect(() => {
		if (editingFeed) {
			setUrl(editingFeed.link);
			setName(editingFeed.name);
			setGroupId(editingFeed.group_id.toString());
			setProxy(editingFeed.proxy ?? "");
			setSuspended(editingFeed.suspended);
			setIsAdvancedOpen(!!editingFeed.proxy);
			setIsMobileErrorTooltipOpen(false);
		}
	}, [editingFeed]);

	const resetForm = () => {
		setUrl("");
		setName("");
		setGroupId("");
		setProxy("");
		setSuspended(false);
		setIsAdvancedOpen(false);
		setIsDeleteOpen(false);
	};

	const handleClose = () => {
		setEditFeedOpen(false);
		resetForm();
		setIsMobileErrorTooltipOpen(false);
	};

	const handleSubmit = async () => {
		if (!editingFeed) return;

		if (!url.trim()) {
			toast.error("请输入订阅地址");
			return;
		}

		if (!name.trim()) {
			toast.error("请输入订阅名称");
			return;
		}

		setIsSubmitting(true);
		try {
			const request: UpdateFeedRequest = {};

			if (url.trim() !== editingFeed.link) {
				request.link = url.trim();
			}

			if (name.trim() !== editingFeed.name) {
				request.name = name.trim();
			}

			const newGroupId = parseInt(groupId, 10);
			if (newGroupId !== editingFeed.group_id) {
				request.group_id = newGroupId;
			}

			if (suspended !== editingFeed.suspended) {
				request.suspended = suspended;
			}

			const newProxy = proxy.trim() || undefined;
			if (newProxy !== editingFeed.proxy) {
				request.proxy = newProxy;
			}

			if (Object.keys(request).length === 0) {
				toast.info("没有可保存的更改");
				handleClose();
				return;
			}

			await updateFeedMutation.mutateAsync({ id: editingFeed.id, ...request });
			toast.success("订阅更新成功");
			handleClose();
		} catch {
			toast.error("更新订阅失败");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async () => {
		if (!editingFeed) return;

		setIsDeleting(true);
		try {
			await deleteFeedMutation.mutateAsync(editingFeed.id);
			toast.success(`已取消订阅“${editingFeed.name}”`);
			setIsDeleteOpen(false);
			handleClose();
		} catch {
			toast.error("取消订阅失败");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<>
			<Dialog
				open={isEditFeedOpen}
				onOpenChange={(open) => setEditFeedOpen(open)}
			>
				<DialogContent
					className="flex w-full max-w-[480px] flex-col gap-0 overflow-hidden p-0"
					showCloseButton={false}
					initialFocus={urlInputRef}
				>
					{/* Header */}
					<DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
						<DialogTitle className="flex items-center gap-1.5 text-base font-semibold">
							<span>编辑订阅</span>
							{editingFeed?.fetch_state.last_error && (
								<Tooltip
									open={isMobile ? isMobileErrorTooltipOpen : undefined}
									onOpenChange={(open) => {
										if (!isMobile || open) return;
										setIsMobileErrorTooltipOpen(false);
									}}
								>
									<TooltipTrigger
										render={
											<button
												type="button"
												aria-label="错误"
												onClick={() => {
													if (!isMobile) return;
													setIsMobileErrorTooltipOpen((open) => !open);
												}}
												className="inline-flex cursor-help items-center text-destructive"
											/>
										}
									>
										<AlertCircle className="h-4 w-4" />
									</TooltipTrigger>
									<TooltipContent
										side="bottom"
										className="max-w-sm whitespace-normal break-words"
									>
										{editingFeed.fetch_state.last_error.trim()}
									</TooltipContent>
								</Tooltip>
							)}
						</DialogTitle>
						<Button variant="ghost" size="icon-sm" onClick={handleClose}>
							<span className="sr-only">取消</span>
							<X className="h-[18px] w-[18px] text-muted-foreground" />
						</Button>
					</DialogHeader>

					{/* Form Content */}
					<div className="space-y-4 p-5">
						{/* URL Section */}
						<div className="space-y-1.5">
							<label
								htmlFor="edit-feed-url"
								className="text-[13px] font-medium"
							>
								订阅地址
							</label>
							<Input
								ref={urlInputRef}
								id="edit-feed-url"
								name="feed-url"
								type="url"
								inputMode="url"
								placeholder="https://example.com/feed.xml"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								className="h-10"
								autoComplete="off"
								spellCheck={false}
							/>
						</div>

						{/* Name Section */}
						<div className="space-y-1.5">
							<label
								htmlFor="edit-feed-name"
								className="text-[13px] font-medium"
							>
								订阅名称
							</label>
							<Input
								id="edit-feed-name"
								name="feed-name"
								placeholder="输入订阅名称..."
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="h-10"
								autoComplete="off"
							/>
						</div>

						{/* Group Section */}
						<div className="space-y-1.5">
							<label
								className="text-[13px] font-medium"
								id="edit-feed-group-label"
							>
								分组
							</label>
							<Select
								value={groupId}
								onValueChange={(v) => {
									if (v) setGroupId(v);
								}}
							>
								<SelectTrigger
									className="h-10"
									aria-labelledby="edit-feed-group-label"
								>
									<SelectValue placeholder="选择分组..." />
								</SelectTrigger>
								<SelectContent>
									{groups.map((group) => (
										<SelectItem key={group.id} value={group.id.toString()}>
											{group.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Suspended Toggle */}
						<div className="flex items-center justify-between">
							<div>
								<label
									htmlFor="edit-feed-suspended"
									className="text-[13px] font-medium"
								>
									暂停订阅
								</label>
								<p className="text-xs text-muted-foreground">暂停自动更新</p>
							</div>
							<Switch
								id="edit-feed-suspended"
								checked={suspended}
								onCheckedChange={setSuspended}
							/>
						</div>

						{/* Advanced Section */}
						<Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
							<CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
								<ChevronDown
									className={cn(
										"h-3.5 w-3.5 transition-transform",
										isAdvancedOpen && "rotate-180",
									)}
								/>
								高级设置
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-1.5 pl-5 pt-3">
								<label
									htmlFor="edit-feed-proxy"
									className="text-[13px] font-medium"
								>
									HTTP 代理
								</label>
								<Input
									id="edit-feed-proxy"
									name="feed-proxy"
									type="url"
									inputMode="url"
									placeholder="http://proxy.example.com:8080"
									value={proxy}
									onChange={(e) => setProxy(e.target.value)}
									className="h-10"
									autoComplete="off"
									spellCheck={false}
								/>
								<p className="text-xs text-muted-foreground">
									留空则使用系统代理设置
								</p>
							</CollapsibleContent>
						</Collapsible>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between border-t px-5 py-4">
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive hover:bg-destructive/10"
							onClick={() => setIsDeleteOpen(true)}
						>
							<Trash2 className="mr-1.5 h-3.5 w-3.5" />
							取消订阅
						</Button>
						<div className="flex items-center gap-3">
							<Button variant="outline" onClick={handleClose}>
								取消
							</Button>
							<Button
								onClick={handleSubmit}
								disabled={isSubmitting || !url.trim() || !name.trim()}
							>
								<Save className="mr-1.5 h-4 w-4" />
								保存
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>取消订阅</DialogTitle>
						<DialogDescription>
							确定要取消订阅“{editingFeed?.name ?? ""}
							”吗？该订阅的所有文章将被删除。
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsDeleteOpen(false)}
							disabled={isDeleting}
						>
							取消
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting ? "删除中..." : "取消订阅"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
