"use client";

/**
 * Sidebar Navigation (per the Figma design)
 *
 * Brand header with the brand switch, the day-to-day pages at the top, and
 * account-level pages (settings, brand management, diagnostics) at the bottom.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpDown,
  Building2,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string; icon: LucideIcon; adminOnly?: boolean };

const mainItems: NavItem[] = [
  { label: "儀表板", href: "/dashboard", icon: LayoutDashboard },
  { label: "自動回覆活動", href: "/campaigns", icon: Megaphone },
  { label: "訊息發送紀錄", href: "/logs", icon: MessagesSquare },
];

const footerItems: NavItem[] = [
  { label: "帳號設定", href: "/settings", icon: Settings },
  { label: "品牌管理", href: "/admin", icon: Building2, adminOnly: true },
  { label: "系統診斷", href: "/diagnostics", icon: Activity },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
  canSwitchBrand: boolean;
  isPlatformAdmin: boolean;
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-foreground"
          : "text-secondary-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      )}
    >
      <Icon className={cn("size-5", active ? "text-primary" : "text-secondary-foreground")} strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}

export default function Sidebar({
  isOpen,
  onClose,
  workspaceName,
  canSwitchBrand,
  isPlatformAdmin,
}: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const footer = footerItems.filter((item) => !item.adminOnly || isPlatformAdmin);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col bg-sidebar text-sidebar-foreground",
          "transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-full lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Same reason as the top bar: the drawer is full height, so the
            brand would otherwise land under the status bar. */}
        <div
          className="flex items-center gap-3 px-6 pt-10 pb-8"
          style={{ paddingTop: "calc(2.5rem + env(safe-area-inset-top))" }}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {workspaceName.slice(0, 1)}
          </div>
          <Link href="/dashboard" onClick={onClose} className="min-w-0 flex-1 truncate text-[17px] font-bold">
            {workspaceName}
          </Link>
          {canSwitchBrand && (
            <Link
              href="/brands"
              onClick={onClose}
              title="切換品牌"
              aria-label="切換品牌"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-secondary-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <ArrowUpDown className="size-5" strokeWidth={1.75} />
            </Link>
          )}
        </div>

        <nav className="flex flex-1 flex-col justify-between overflow-y-auto px-6 pb-8">
          <div className="space-y-2">
            {mainItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} onClick={onClose} />
            ))}
          </div>
          <div className="space-y-2 pt-8">
            {footer.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} onClick={onClose} />
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}
