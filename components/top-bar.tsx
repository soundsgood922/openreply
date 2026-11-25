"use client";

/**
 * Top Bar
 *
 * Page title, mobile hamburger, and connection status.
 */

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const OWN_HEADER_PAGES = new Set(["/dashboard", "/campaigns"]);

// Pages titled in Chinese by the designs rather than through the catalog.
const designTitles: Record<string, string> = {
  "/dashboard": "儀表板",
  "/campaigns": "自動回覆活動",
  "/logs": "訊息發送紀錄",
  "/settings": "帳號設定",
  "/diagnostics": "系統診斷",
  "/admin": "品牌管理",
};

const pageTitles: Record<string, StaticMessageKey> = {
  "/dashboard": "Dashboard",
  "/campaigns/import": "Import campaigns",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New Campaign",
  "/automations": "Campaigns",
  "/automations/new": "New Campaign",
  "/logs": "DM Logs",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
};

interface TopBarProps {
  onMenuClick: () => void;
  brandName: string;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function TopBar({
  onMenuClick,
  brandName,
}: TopBarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const title: StaticMessageKey = pageTitles[pathname] ?? (
    pathname.endsWith("/edit") ? "Edit campaign"
      : pathname.startsWith("/campaigns/") ? "Campaign details" : "Dashboard"
  );

  // These pages draw their own title row (title plus platform switch), so on
  // a desktop the bar would only repeat it.
  const ownHeader = OWN_HEADER_PAGES.has(pathname);

  return (
    <header
      // Installed to the home screen the app starts at the very top of the
      // display, so without the inset the title sits under the clock and
      // battery. The inset is 0 in a browser tab and on desktop.
      className={`sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur ${
        ownHeader
          ? "lg:hidden"
          : "lg:static lg:h-auto lg:w-full lg:max-w-[1600px] lg:border-0 lg:bg-background lg:px-16 lg:pt-10 lg:pb-2 lg:backdrop-blur-none"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          onClick={onMenuClick}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label={t("Toggle sidebar")}
        >
          <Menu className="size-4" />
        </button>
        <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg lg:text-2xl lg:font-bold">{designTitles[pathname] ?? t(title)}</h1>
      </div>

      <span className="shrink-0 truncate rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground lg:hidden">{brandName}</span>
    </header>
  );
}
