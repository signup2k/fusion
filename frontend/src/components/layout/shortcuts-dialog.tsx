import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUIStore } from "@/store";

interface ShortcutItem {
  keys: string;
  action: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

export function ShortcutsDialog() {
  const isShortcutsOpen = useUIStore((s) => s.isShortcutsOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);

  const sections: ShortcutSection[] = [
    {
      title: "全局",
      items: [
        { keys: "Cmd+K / Ctrl+K", action: "切换搜索弹窗" },
        { keys: "/", action: "打开搜索" },
        { keys: "Cmd+, / Ctrl+,", action: "打开设置" },
        { keys: "?", action: "打开快捷键帮助" },
        { keys: "Esc", action: "关闭当前打开的弹窗或抽屉" },
      ],
    },
    {
      title: "文章",
      items: [
        {
          keys: "j / ArrowDown / n",
          action: "选择下一篇文章",
        },
        {
          keys: "k / ArrowUp / p",
          action: "选择上一篇文章",
        },
        { keys: "m", action: "切换已读/未读" },
        { keys: "s / f", action: "切换收藏" },
        { keys: "o / v", action: "打开原文" },
      ],
    },
    {
      title: "导航",
      items: [
        { keys: "g u", action: "跳转到未读文章" },
        { keys: "g a", action: "跳转到全部文章" },
        { keys: "g s", action: "跳转到收藏文章" },
        { keys: "g f", action: "跳转到订阅管理" },
      ],
    },
  ];

  return (
    <Dialog open={isShortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div
                    key={`${section.title}-${item.keys}`}
                    className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                  >
                    <span className="text-sm text-muted-foreground">{item.action}</span>
                    <kbd className="rounded bg-muted px-2 py-1 font-mono text-xs font-medium text-foreground">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
