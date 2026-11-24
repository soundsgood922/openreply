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

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-8"
      // Installed to the home screen the app starts at the very top of the
      // display, so without this the title sits under the clock and battery.
      // The inset is 0 in a browser tab and on desktop.
      style={{
        height: "calc(4rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          onClick={onMenuClick}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label={t("Toggle sidebar")}
        >
          <Menu className="size-4" />
        </button>
        <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{pathname.startsWith("/admin") ? "品牌管理" : t(title)}</h1>
      </div>

      <span className="shrink-0 truncate rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{brandName}</span>
    </header>
  );
}
