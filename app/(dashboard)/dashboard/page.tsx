"use client";

/**
 * Dashboard Home Page (per the Figma design)
 *
 * Greeting, shortcuts (new campaign, the connected Instagram account and
 * Facebook Page), four headline numbers and the 7-day DM chart.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import { FacebookIcon, InstagramIcon } from "@/components/brand-icons";

interface DashboardStats {
  userName: string | null;
  contactsCount: number;
  reachedContactsCount: number;
  activeAutomations: number;
  ctrThisMonth: number;
  instagramAccounts: AccountOption[];
  dailyDMs: { date: string; count: number }[];
}

export default function DashboardPage() {
  const { label } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") params.set("instagramAccountId", selectedAccountId);

    fetch(`/api/dashboard/stats${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStats(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAccountId]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  const accounts = stats?.instagramAccounts ?? [];
  const instagram = accounts.find((a) => a.provider !== "FACEBOOK");
  const facebook = accounts.find((a) => a.provider === "FACEBOOK");
  const maxDM = Math.max(...(stats?.dailyDMs.map((d) => d.count) ?? [1]), 1);

  return (
    <div className="space-y-8">
      <PageHeader
        title="儀表板"
        actions={
          accounts.length > 1 && (
            <AccountSelect accounts={accounts} value={selectedAccountId} onChange={handleAccountChange} />
          )
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              哈囉，{stats?.userName ?? "你好"}！
            </h2>
            <p className="mt-2 text-sm text-secondary-foreground">已連接 {accounts.length} 個平台</p>
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-4">
            <Link
              href="/campaigns/new"
              className="inline-flex h-14 items-center gap-3 rounded-xl bg-primary px-7 text-base font-bold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-5" strokeWidth={2.5} />
              建立自動化回覆活動
            </Link>
            {instagram && (
              <a
                href={`https://www.instagram.com/${instagram.username}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 items-center gap-3 rounded-xl bg-secondary px-6 text-base text-secondary-foreground hover:bg-border/60"
              >
                <InstagramIcon className="size-5" />
                前往 Instagram 帳號
              </a>
            )}
            {facebook && (
              <a
                href={`https://www.facebook.com/${facebook.instagramId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 items-center gap-3 rounded-xl bg-secondary px-6 text-base text-secondary-foreground hover:bg-border/60"
              >
                <FacebookIcon className="size-5" />
                前往 Facebook 粉絲專頁
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="啟用中的活動" value={stats?.activeAutomations ?? 0} />
            <StatCard label="平均點擊率" value={`${stats?.ctrThisMonth ?? 0}%`} />
            <StatCard label="聯絡人數量" value={stats?.contactsCount ?? 0} />
            <StatCard label="成功送達人數" value={stats?.reachedContactsCount ?? 0} />
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] text-secondary-foreground">最近 7 天的私訊</h2>
            <div className="mt-6 flex h-64 items-end gap-3 sm:gap-5">
              {stats?.dailyDMs.map((day) => (
                <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center gap-3">
                  <span className="text-sm text-muted-foreground tabular-nums">{day.count}</span>
                  {/* A percentage height needs a parent with a definite height. */}
                  <div className="flex w-full min-h-0 flex-1 items-end">
                    <div
                      className="w-full rounded-lg bg-primary"
                      style={{ height: day.count ? `${(day.count / maxDM) * 100}%` : "6px" }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-sm text-muted-foreground">
                    {label(day.date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
