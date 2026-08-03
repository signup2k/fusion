import { useRef, useState } from "react";
import { FileUp, Upload, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store";
import { useQueryClient } from "@tanstack/react-query";
import { groupAPI, feedAPI } from "@/lib/api";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseOPML } from "@/lib/opml";

export function ImportOpmlDialog() {
	const { isImportOpmlOpen, setImportOpmlOpen } = useUIStore();
	const queryClient = useQueryClient();
	const fileInputId = "opml-file-input";

	const [file, setFile] = useState<File | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const resetState = () => {
		setFile(null);
		setIsDragging(false);
	};

	const handleClose = () => {
		setImportOpmlOpen(false);
		resetState();
	};

	const handleFileSelect = (selectedFile: File | null) => {
		if (!selectedFile) return;

		const validTypes = [
			"text/xml",
			"application/xml",
			"text/x-opml",
			"application/x-opml",
		];
		const validExtensions = [".opml", ".xml"];
		const hasValidExtension = validExtensions.some((ext) =>
			selectedFile.name.toLowerCase().endsWith(ext),
		);

		if (!validTypes.includes(selectedFile.type) && !hasValidExtension) {
			toast.error("请选择 OPML 或 XML 文件");
			return;
		}

		setFile(selectedFile);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		const droppedFile = e.dataTransfer.files[0];
		handleFileSelect(droppedFile);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleImport = async () => {
		if (!file) return;

		setIsImporting(true);
		try {
			const content = await file.text();
			const parsedFeeds = parseOPML(content);

			if (parsedFeeds.length === 0) {
				toast.info("OPML 文件中未发现订阅");
				return;
			}

			// Get existing groups
			const groupsRes = await groupAPI.list();
			const existingGroups = groupsRes.data;
			const groupNameToId = new Map(existingGroups.map((g) => [g.name, g.id]));

			// Collect unique group names that need to be created
			const newGroupNames = new Set<string>();
			parsedFeeds.forEach((feed) => {
				if (feed.groupName && !groupNameToId.has(feed.groupName)) {
					newGroupNames.add(feed.groupName);
				}
			});

			// Create missing groups
			for (const name of newGroupNames) {
				const res = await groupAPI.create({ name });
				if (res.data) {
					groupNameToId.set(name, res.data.id);
				}
			}

			// Use default group for feeds without a group
			let defaultGroupId: number | undefined = groupNameToId
				.values()
				.next().value;
			if (defaultGroupId === undefined) {
				const res = await groupAPI.create({ name: "导入（未分组）" });
				if (res.data) {
					defaultGroupId = res.data.id;
					groupNameToId.set("导入（未分组）", res.data.id);
				}
			}

			// Prepare batch create request
			const feedsToCreate = parsedFeeds.map((feed) => {
				const groupId = feed.groupName
					? (groupNameToId.get(feed.groupName) ?? defaultGroupId!)
					: defaultGroupId!;
				return {
					group_id: groupId,
					name: feed.name,
					link: feed.link,
					...(feed.siteUrl ? { site_url: feed.siteUrl } : {}),
				};
			});

			const response = await feedAPI.batchCreate({ feeds: feedsToCreate });
			if (response.data) {
				const { created, failed, errors } = response.data;

				// Invalidate all caches after import
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: queryKeys.groups.all }),
					queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
					queryClient.invalidateQueries({ queryKey: queryKeys.items.all }),
				]);

				if (created > 0) {
					toast.success(`已导入 ${created} 个订阅`);
				}

				if (failed > 0) {
					const errorMsg = errors?.join(", ") || "导入 OPML 失败";
					toast.warning(`${failed} 个订阅导入失败：${errorMsg}`);
				}

				if (created === 0 && failed === 0) {
					toast.info("OPML 文件中没有新订阅");
				}

				handleClose();
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "导入 OPML 失败");
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<Dialog open={isImportOpmlOpen} onOpenChange={setImportOpmlOpen}>
			<DialogContent
				className="flex w-full max-w-[480px] flex-col gap-0 overflow-hidden p-0"
				showCloseButton={false}
			>
				<DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
					<DialogTitle className="text-base font-semibold">
						导入 OPML
					</DialogTitle>
					<Button variant="ghost" size="icon-sm" onClick={handleClose}>
						<span className="sr-only">取消</span>
						<X className="h-[18px] w-[18px] text-muted-foreground" />
					</Button>
				</DialogHeader>

				<div className="p-5">
					<input
						ref={fileInputRef}
						id={fileInputId}
						type="file"
						accept=".opml,.xml,text/xml,application/xml"
						className="hidden"
						aria-label="导入 OPML"
						onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
					/>

					<label
						htmlFor={fileInputId}
						onDrop={handleDrop}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						className={cn(
							"flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
							isDragging
								? "border-primary bg-primary/5"
								: "border-muted-foreground/25 hover:border-muted-foreground/50",
							file && "border-primary bg-primary/5",
						)}
					>
						{file ? (
							<>
								<FileUp className="mb-3 h-10 w-10 text-primary" />
								<p className="text-sm font-medium">{file.name}</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{(file.size / 1024).toFixed(1)} KB
								</p>
								<Button
									variant="link"
									size="sm"
									className="mt-2 h-auto p-0 text-xs"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setFile(null);
									}}
								>
									选择其他文件
								</Button>
							</>
						) : (
							<>
								<Upload className="mb-3 h-10 w-10 text-muted-foreground" />
								<p className="text-sm font-medium">
									将 OPML 文件拖到这里，或点击浏览
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									支持 .opml 和 .xml 文件
								</p>
							</>
						)}
					</label>
				</div>

				<div className="flex items-center justify-end gap-3 border-t px-5 py-4">
					<Button variant="outline" onClick={handleClose}>
						取消
					</Button>
					<Button onClick={handleImport} disabled={!file || isImporting}>
						<Upload className="mr-1.5 h-4 w-4" />
						{isImporting ? "导入中..." : "导入"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
