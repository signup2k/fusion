import { useId, useState } from "react";
import { ChevronRight, Folder, Layers, Rss } from "lucide-react";
import type { PublicFeed, PublicGroup, PublicScope } from "@/lib/public-api";
import { cn } from "@/lib/utils";

export function PublicSourceNav({ groups, feeds, scope, onSelect }: {
  groups: PublicGroup[];
  feeds: PublicFeed[];
  scope: PublicScope;
  onSelect: (scope: PublicScope) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(() => new Set());
  const navId = useId();

  const toggleGroup = (id: number) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <nav aria-label="订阅源分组" className="space-y-1 p-3">
      <button
        type="button"
        aria-current={scope.kind === "all" ? "true" : undefined}
        onClick={() => onSelect({ kind: "all" })}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
          scope.kind === "all" && "bg-accent text-accent-foreground",
        )}
      >
        <Layers className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">全部订阅源</span>
        <span className="text-xs text-muted-foreground">{feeds.length}</span>
      </button>
      <p className="px-2 pt-4 pb-2 text-xs font-medium text-muted-foreground">订阅源分组</p>
      {groups.map((group) => {
        const groupFeeds = feeds.filter((feed) => feed.group_id === group.id);
        const isOpen = !collapsedGroups.has(group.id);
        const selected = scope.kind === "group" && scope.id === group.id;
        const panelId = `${navId}-group-${group.id}`;

        return (
          <div key={group.id} className="min-w-0">
            <div className={cn("flex min-w-0 items-center rounded-md", selected && "bg-accent text-accent-foreground")}>
              <button
                type="button"
                aria-label={`${isOpen ? "收起" : "展开"}分组“${group.name}”`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.id)}
                className="shrink-0 rounded-md p-2 text-muted-foreground outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
              </button>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect({ kind: "group", id: group.id })}
                title={group.name}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pr-2 text-left text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{groupFeeds.length}</span>
              </button>
            </div>
            <div id={panelId} hidden={!isOpen} className="space-y-0.5 pb-2 pl-5">
              {groupFeeds.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">暂无订阅源</p>}
              {groupFeeds.map((feed) => (
                <button
                  key={feed.id}
                  type="button"
                  aria-current={scope.kind === "feed" && scope.id === feed.id ? "true" : undefined}
                  onClick={() => onSelect({ kind: "feed", id: feed.id })}
                  title={feed.name}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
                    scope.kind === "feed" && scope.id === feed.id && "bg-accent text-accent-foreground",
                  )}
                >
                  <Rss className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{feed.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
