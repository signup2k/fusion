import { useState } from "react";
import { FolderPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUIStore } from "@/store";
import { useCreateGroup } from "@/queries/groups";
import { toast } from "sonner";

export function AddGroupDialog() {
  const isMobile = useIsMobile();
  const { isAddGroupOpen, setAddGroupOpen } = useUIStore();
  const createGroup = useCreateGroup();

  const [name, setName] = useState("");

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await createGroup.mutateAsync(trimmed);
      setName("");
      setAddGroupOpen(false);
      toast.success("分组已创建");
    } catch {
      toast.error("创建分组失败");
    }
  };

  return (
    <Dialog
      open={isAddGroupOpen}
      onOpenChange={(open) => {
        setAddGroupOpen(open);
        if (!open) setName("");
      }}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>添加分组</DialogTitle>
          <DialogDescription>
            创建新分组以整理你的订阅。
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <label htmlFor="add-group-name" className="sr-only">
            添加分组
          </label>
          <FolderPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="add-group-name"
            name="group-name"
            placeholder="分组名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="pl-10"
            autoComplete="off"
            aria-label="分组名称"
            autoFocus={!isMobile}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAddGroupOpen(false)}
            disabled={createGroup.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createGroup.isPending}
          >
            {createGroup.isPending ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
