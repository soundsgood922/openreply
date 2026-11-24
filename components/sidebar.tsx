"use client";

/**
 * Sidebar Navigation
 *
 * Brand header (with the brand switch for people in several brands), the
 * page links, and the brand overview link for platform admins.
 */

import { useI18n } from "@/lib/i18n/provider";
import type { StaticMessageKey } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  Building2,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems: { label: StaticMessageKey; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "DM Logs", href: "/logs", icon: MessagesSquare },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Diagnostics", href: "/diagnostics", icon: Activity },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
  canSwitchBrand: boolean;
  isPlatformAdmin: boolean;
}

function NavLink({
  href,
  icon: Icon,
  active,
  onClick,
  children,
}: {
  href: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className={cn("size-4", active && "text-primary")} />
      {children}
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
  const { t } = useI18n();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-dvh w-64 max-w-[85vw] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-full lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Same reason as the top bar: the drawer is full height, so the
            brand would otherwise land under the status bar. */}
        <div
          className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            {workspaceName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <Link href="/dashboard" onClick={onClose} className="block truncate text-sm font-semibold">
              {workspaceName}
            </Link>
            {canSwitchBrand ? (
              <Link
                href="/brands"
                onClick={onClose}
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <ArrowLeftRight className="size-3" />
                切換品牌
              </Link>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">留言自動回覆</p>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              active={isActive(item.href)}
              onClick={onClose}
            >
              {t(item.label)}
            </NavLink>
          ))}

          {isPlatformAdmin && (
            <div className="mt-4 border-t border-sidebar-border pt-4">
              <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">管理</p>
              <NavLink href="/admin" icon={Building2} active={isActive("/admin")} onClick={onClose}>
                品牌管理
              </NavLink>
            </div>
          )}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-xs text-muted-foreground">{t("Self-hosted")}</p>
        </div>
      </aside>
    </>
  );
}
