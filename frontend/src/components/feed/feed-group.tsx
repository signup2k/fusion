import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, MoreHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";
import { usePreferencesStore } from "@/store";
import { FeedItem } from "./feed-item";
import type { Feed } from "@/lib/api";

interface FeedGroupProps {
	groupId: number;
	name: string;
	feeds: Feed[];
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveGroup: (direction: "up" | "down") => void;
	manualSorting: boolean;
	onMoveFeed: (feedId: number, direction: "up" | "down") => void;
}

export function FeedGroup({
	groupId,
	name,
	feeds,
	canMoveUp,
	canMoveDown,
	onMoveGroup,
	manualSorting,
	onMoveFeed,
}: FeedGroupProps) {
	const { groupAutoExpand, setGroupAutoExpand } = usePreferencesStore();
	const autoExpand = groupAutoExpand[groupId] ?? true;
	const [isOpen, setIsOpen] = useState(autoExpand);
	const { selectedGroupId, setSelectedGroup } = useUrlState();
	const isSelected = selectedGroupId === groupId;

	const unreadCount = feeds.reduce(
		(sum, feed) => sum + (feed.unread_count || 0),
		0,
	);

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={setIsOpen}
			className="w-full min-w-0"
		>
			<div
				className={cn(
					"group flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
					isSelected
						? "bg-accent text-accent-foreground"
						: "hover:bg-accent/50",
				)}
			>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsOpen(!isOpen);
					}}
					className="shrink-0 p-1 -m-1 rounded-md transition-colors hover:bg-foreground/10"
					aria-label={isOpen ? `收起${name}` : `展开${name}`}
				>
					<ChevronRight
						className={cn(
							"h-4 w-4 text-muted-foreground transition-transform",
							isOpen && "rotate-90",
						)}
					/>
				</button>
				<button
					type="button"
					onClick={() => setSelectedGroup(groupId)}
					className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
				>
					<span className="block min-w-0 flex-1 truncate">{name}</span>
					{unreadCount > 0 && (
						<span className="shrink-0 text-[11px] text-muted-foreground">
							{unreadCount}
						</span>
					)}
				</button>
				<Button
					variant="ghost"
					size="icon-xs"
					className="inline-flex md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex"
					onClick={() => onMoveGroup("up")}
					disabled={!canMoveUp}
					aria-label={`上移文件夹“${name}”`}
				>
					<ArrowUp className="text-muted-foreground" />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					className="inline-flex md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex"
					onClick={() => onMoveGroup("down")}
					disabled={!canMoveDown}
					aria-label={`下移文件夹“${name}”`}
				>
					<ArrowDown className="text-muted-foreground" />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-xs"
								className="inline-flex shrink-0 md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex"
								aria-label="文件夹展开方式"
							>
								<MoreHorizontal className="text-muted-foreground" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuLabel>文件夹展开方式</DropdownMenuLabel>
							<DropdownMenuCheckboxItem
								checked={autoExpand}
								onCheckedChange={(checked) => {
									setGroupAutoExpand(groupId, checked);
									setIsOpen(checked);
								}}
							>
								自动展开
							</DropdownMenuCheckboxItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<CollapsibleContent>
				<div className="w-full min-w-0 pl-5">
					{feeds.map((feed, index) => (
						<FeedItem
							key={feed.id}
							feed={feed}
							manualSorting={manualSorting}
							canMoveUp={index > 0}
							canMoveDown={index < feeds.length - 1}
							onMove={(direction) => onMoveFeed(feed.id, direction)}
						/>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
