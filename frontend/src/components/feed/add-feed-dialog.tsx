import { useState } from "react";
import { ChevronDown, Plus, Radar, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { useUIStore } from "@/store";
import { useGroups } from "@/queries/groups";
import { useCreateFeed } from "@/queries/feeds";
import {
	feedAPI,
	type CreateFeedRequest,
	type DiscoveredFeed,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function AddFeedDialog() {
	const { isAddFeedOpen, setAddFeedOpen } = useUIStore();
	const { data: groups = [] } = useGroups();
	const createFeed = useCreateFeed();

	const [url, setUrl] = useState("");
	const [name, setName] = useState("");
	const [groupId, setGroupId] = useState<string>("");
	const [proxy, setProxy] = useState("");
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isValidating, setIsValidating] = useState(false);
	const [detectedFeeds, setDetectedFeeds] = useState<DiscoveredFeed[]>([]);
	const [isFeedSelectOpen, setIsFeedSelectOpen] = useState(false);

	const resetForm = () => {
		setUrl("");
		setName("");
		setGroupId("");
		setProxy("");
		setIsAdvancedOpen(false);
		setDetectedFeeds([]);
		setIsFeedSelectOpen(false);
	};

	const handleClose = () => {
		setAddFeedOpen(false);
		resetForm();
	};

	const handleSelectDetectedFeed = (feed: DiscoveredFeed) => {
		setUrl(feed.link);
		setName((prev) => {
			if (prev.trim() || !feed.title.trim()) {
				return prev;
			}
			return feed.title.trim();
		});
		setIsFeedSelectOpen(false);
		setDetectedFeeds([]);
		toast.success("已检测到订阅地址");
	};

	const handleValidate = async () => {
		if (!url.trim()) return;

		setIsValidating(true);
		try {
			const response = await feedAPI.validate({ url: url.trim() });
			const feeds = response.data?.feeds ?? [];

			if (feeds.length === 0) {
				toast.info("该地址未发现订阅");
				return;
			}

			if (feeds.length === 1) {
				handleSelectDetectedFeed(feeds[0]);
				return;
			}

			setDetectedFeeds(feeds);
			setIsFeedSelectOpen(true);
		} catch {
			toast.error("发现订阅失败");
		} finally {
			setIsValidating(false);
		}
	};

	const handleSubmit = async () => {
		if (!url.trim()) {
			toast.error("请输入订阅地址");
			return;
		}

		const selectedGroupId = groupId
			? parseInt(groupId, 10)
			: (groups[0]?.id ?? 1);

		setIsSubmitting(true);
		try {
			const request: CreateFeedRequest = {
				link: url.trim(),
				name: name.trim() || url.trim(),
				group_id: selectedGroupId,
			};

			if (proxy.trim()) {
				request.proxy = proxy.trim();
			}

			await createFeed.mutateAsync(request);
			toast.success("订阅添加成功");
			handleClose();
		} catch {
			toast.error("添加订阅失败");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<Dialog open={isAddFeedOpen} onOpenChange={setAddFeedOpen}>
				<DialogContent
					className="flex w-full max-w-[480px] flex-col gap-0 overflow-hidden p-0"
					showCloseButton={false}
				>
					{/* Header */}
					<DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
						<DialogTitle className="text-base font-semibold">
							添加订阅
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
							<label htmlFor="add-feed-url" className="text-[13px] font-medium">
								订阅地址
							</label>
							<div className="flex gap-2">
								<Input
									id="add-feed-url"
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
								<Button
									variant="outline"
									size="icon"
									className="h-10 w-10 shrink-0"
									onClick={handleValidate}
									disabled={isValidating || !url.trim()}
									aria-label="验证订阅地址"
									title="验证订阅地址"
								>
									<Radar
										className={cn(
											"h-[18px] w-[18px]",
											isValidating && "animate-pulse",
										)}
									/>
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								点击图标自动检测网站订阅地址
							</p>
						</div>

						{/* Name Section */}
						<div className="space-y-1.5">
							<label
								htmlFor="add-feed-name"
								className="text-[13px] font-medium"
							>
								订阅名称
							</label>
							<Input
								id="add-feed-name"
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
								id="add-feed-group-label"
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
									aria-labelledby="add-feed-group-label"
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
									htmlFor="add-feed-proxy"
									className="text-[13px] font-medium"
								>
									HTTP 代理
								</label>
								<Input
									id="add-feed-proxy"
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
					<div className="flex items-center justify-end gap-3 border-t px-5 py-4">
						<Button variant="outline" onClick={handleClose}>
							取消
						</Button>
						<Button
							onClick={handleSubmit}
							disabled={isSubmitting || !url.trim()}
						>
							<Plus className="mr-1.5 h-4 w-4" />
							添加订阅
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={isFeedSelectOpen}
				onOpenChange={(open) => {
					setIsFeedSelectOpen(open);
					if (!open) {
						setDetectedFeeds([]);
					}
				}}
			>
				<DialogContent
					className="w-full max-w-[560px] p-0"
					showCloseButton={false}
				>
					<DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
						<div>
							<DialogTitle className="text-base font-semibold">
								选择订阅
							</DialogTitle>
							<DialogDescription>
								发现多个订阅，请选择一个填入地址。
							</DialogDescription>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => {
								setIsFeedSelectOpen(false);
								setDetectedFeeds([]);
							}}
						>
							<span className="sr-only">取消</span>
							<X className="h-[18px] w-[18px] text-muted-foreground" />
						</Button>
					</DialogHeader>

					<div className="max-h-[360px] space-y-2 overflow-y-auto p-4">
						{detectedFeeds.map((feed, index) => (
							<button
								key={`${feed.link}-${index}`}
								type="button"
								onClick={() => handleSelectDetectedFeed(feed)}
								className="w-full rounded-md border p-3 text-left transition-colors hover:bg-accent/50"
							>
								<p className="truncate text-sm font-medium">
									{feed.title || `订阅 ${index + 1}`}
								</p>
								<p className="mt-1 truncate text-xs text-muted-foreground">
									{feed.link}
								</p>
							</button>
						))}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
