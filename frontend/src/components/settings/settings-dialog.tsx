import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bug, Download, Info, Keyboard, Palette } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	articlePageSizeOptions,
	fontSizeOptions,
	usePreferencesStore,
	useUIStore,
} from "@/store";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/utils";
import type { AppFontSize } from "@/store/preferences";

const fontSizeLabels: Record<AppFontSize, string> = {
	small: "小",
	default: "默认",
	large: "大",
	xlarge: "超大",
};

function GithubIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
		</svg>
	);
}

type SettingsTab = "appearance" | "about";

interface NavItemProps {
	icon: React.ReactNode;
	label: string;
	active: boolean;
	onClick: () => void;
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:w-full sm:gap-2.5 sm:px-2",
				active
					? "bg-accent font-medium text-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			{icon}
			<span className="whitespace-nowrap">{label}</span>
		</button>
	);
}

function AppearanceContent() {
	const { theme, setTheme } = useTheme();
	const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
	const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
	const { articlePageSize, fontSize, setArticlePageSize, setFontSize } =
		usePreferencesStore();

	return (
		<div className="space-y-5">
			{/* Font size */}
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="text-sm font-medium">字体大小</p>
					<p className="text-[13px] text-muted-foreground">
						调整应用内的文字大小
					</p>
				</div>
				<Select
					value={fontSize}
					onValueChange={(value) => {
						if (value) setFontSize(value);
					}}
				>
					<SelectTrigger className="w-auto gap-2 border-border">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{fontSizeOptions.map((size) => (
							<SelectItem key={size} value={size}>
								{fontSizeLabels[size]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Articles per load */}
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="text-sm font-medium">每次加载文章数</p>
					<p className="text-[13px] text-muted-foreground">
						每次加载的文章数量
					</p>
				</div>
				<Select
					value={articlePageSize.toString()}
					onValueChange={(value) => {
						if (!value) return;
						const parsed = Number.parseInt(value, 10);
						if (!Number.isNaN(parsed)) {
							setArticlePageSize(parsed);
						}
					}}
				>
					<SelectTrigger className="w-auto gap-2 border-border">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{articlePageSizeOptions.map((size) => (
							<SelectItem key={size} value={size.toString()}>
								{size}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Theme */}
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="text-sm font-medium">主题</p>
					<p className="text-[13px] text-muted-foreground">选择你的主题</p>
				</div>
				<Select
					value={theme}
					onValueChange={(v) => {
						if (v) setTheme(v);
					}}
				>
					<SelectTrigger className="w-auto gap-2 border-border">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="light">浅色</SelectItem>
						<SelectItem value="dark">深色</SelectItem>
						<SelectItem value="system">跟随系统</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Keyboard shortcuts */}
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="text-sm font-medium">键盘快捷键</p>
					<p className="text-[13px] text-muted-foreground">
						查看所有可用的键盘快捷键
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setSettingsOpen(false);
						setShortcutsOpen(true);
					}}
				>
					<Keyboard className="h-4 w-4" />
					查看
				</Button>
			</div>
		</div>
	);
}

function AboutContent() {
	const { isInstallAvailable, promptInstall } = usePWAInstall();
	const [isInstalling, setIsInstalling] = useState(false);

	const handleInstall = async () => {
		setIsInstalling(true);
		try {
			const isInstalled = await promptInstall();
			if (!isInstalled) {
				toast.info("已取消安装");
			}
		} finally {
			setIsInstalling(false);
		}
	};

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 pb-8">
			<img
				src="/icon-96.png"
				alt="Fusion 标志"
				width={64}
				height={64}
				className="h-16 w-16 rounded-2xl"
			/>
			<div className="text-center">
				<h3 className="text-xl font-semibold">Fusion</h3>
				<p className="mt-1 text-xs text-muted-foreground">{__APP_VERSION__}</p>
				<p className="mt-1.5 text-sm text-muted-foreground">
					一个轻量级 RSS 聚合与阅读器。
				</p>
			</div>
			<div className="flex gap-2">
				{isInstallAvailable && (
					<Button
						variant="default"
						size="sm"
						onClick={() => {
							void handleInstall();
						}}
						disabled={isInstalling}
					>
						<Download className="h-4 w-4" />
						{isInstalling ? "安装中..." : "安装应用"}
					</Button>
				)}
				<Button
					variant="outline"
					size="sm"
					render={
						<a
							href="https://github.com/0x2e/fusion"
							target="_blank"
							rel="noopener noreferrer"
						/>
					}
				>
					<GithubIcon className="h-4 w-4" />
					GitHub
				</Button>
				<Button
					variant="outline"
					size="sm"
					render={
						<a
							href="https://github.com/0x2e/fusion/issues"
							target="_blank"
							rel="noopener noreferrer"
						/>
					}
				>
					<Bug className="h-4 w-4" />
					报告问题
				</Button>
			</div>
			<p className="mt-auto text-xs text-muted-foreground">
				MIT 许可证 © 2024 Rook1e
			</p>
		</div>
	);
}

export function SettingsDialog() {
	const { isSettingsOpen, setSettingsOpen } = useUIStore();
	const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

	const tabTitles: Record<SettingsTab, string> = {
		appearance: "外观",
		about: "关于",
	};

	return (
		<Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
			<DialogContent className="flex max-h-[85vh] flex-col sm:flex-row h-auto sm:h-[560px] sm:max-w-4xl gap-0 overflow-hidden p-0">
				{/* Sidebar (desktop) / Tab bar (mobile) */}
				<div className="flex shrink-0 flex-row border-b border-border bg-muted/30 px-3 pt-3 sm:w-[200px] sm:flex-col sm:border-b-0 sm:border-r sm:pt-4">
					<h2 className="hidden px-2 text-sm font-semibold sm:block">设置</h2>
					<nav className="flex gap-0.5 sm:mt-2 sm:flex-col">
						<NavItem
							icon={<Palette className="h-4 w-4" />}
							label="外观"
							active={activeTab === "appearance"}
							onClick={() => setActiveTab("appearance")}
						/>
						<NavItem
							icon={<Info className="h-4 w-4" />}
							label="关于"
							active={activeTab === "about"}
							onClick={() => setActiveTab("about")}
						/>
					</nav>
				</div>

				{/* Content */}
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 sm:p-6">
					<h2 className="mb-4 shrink-0 text-lg font-semibold sm:mb-6">
						{tabTitles[activeTab]}
					</h2>

					<div className="flex-1 overflow-y-auto">
						{activeTab === "appearance" && <AppearanceContent />}
						{activeTab === "about" && <AboutContent />}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
