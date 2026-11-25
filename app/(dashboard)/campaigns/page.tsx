"use client";

/**
 * Campaigns List Page
 *
 * Shows all campaigns as cards with toggle and delete.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountSelect, { PlatformTag, type AccountOption } from "@/components/account-select";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import { Ellipsis, Plus, Search } from "lucide-react";
import { readCache, writeCache } from "@/lib/client-cache";

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  isActive: boolean;
  wholeWordMatch: boolean;
  instagramAccountId: string;
  instagramAccount: {
    username: string;
    instagramId: string;
    provider?: AccountOption["provider"];
  };
  reportShareSlug: string | null;
  reportShareEnabled: boolean;
  reportUrl: string | null;
  createdAt: string;
  _count: { dmLogs: number };
  trackedLinks: Array<{
    id: string;
    slug: string;
    label: string | null;
    destinationUrl: string;
    trackedUrl: string;
    _count: { clicks: number };
  }>;
  analytics: {
    sent: number;
    skipped: number;
    failed: number;
    clicks: number;
    runs: number;
    claims: number;
    linkRecipients: number;
    ctr: number;
    topKeywords: { keyword: string; count: number }[];
  };
}

export default function CampaignsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [automations, setAutomations] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [loading, setLoading] = useState(true);
  // postId -> current thumbnail URL, fetched live (Instagram URLs expire, so
  // they are never stored on the campaign).
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  // postId -> video URL for reels (cached with the thumbnails; not shown now
  // that a thumbnail opens the post).
  const [, setVideos] = useState<Record<string, string>>({});
  // The reel currently playing in the lightbox (null when closed).
  const [playingVideo, setPlayingVideo] = useState<{
    url: string;
    postUrl: string | null;
  } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ contactsCount: number; ctrThisMonth: number } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">(
    "all"
  );

  const fetchAutomations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccountId !== "all") {
        params.set("instagramAccountId", selectedAccountId);
      }
      const res = await fetch(
        `/api/automations${params.size ? `?${params}` : ""}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) setAutomations(data.data);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") params.set("instagramAccountId", selectedAccountId);
    fetch(`/api/dashboard/stats${params.size ? `?${params}` : ""}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.success) return;
        setAccounts(payload.data.instagramAccounts ?? []);
        setSummary({
          contactsCount: payload.data.contactsCount ?? 0,
          ctrThisMonth: payload.data.ctrThisMonth ?? 0,
        });
      })
      .catch(console.error);
  }, [selectedAccountId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAutomations();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAutomations]);

  // Fetch fresh post thumbnails (and reel video URLs) for the accounts in view
  // and map them by postId. Cache-first so they show instantly on a return
  // visit. Instagram URLs expire, so they are never stored on the campaign.
  useEffect(() => {
    if (automations.length === 0) return;
    let cancelled = false;
    const accountIds = Array.from(
      new Set(automations.map((a) => a.instagramAccountId))
    ).sort();
    const cacheKey = `ig-media:${accountIds.join(",")}`;

    const cached = readCache<{
      thumbs: Record<string, string>;
      videos: Record<string, string>;
    }>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setThumbnails(cached.data.thumbs);
      setVideos(cached.data.videos);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    Promise.all(
      accountIds.map((accountId) =>
        fetch(`/api/instagram/posts?instagramAccountId=${accountId}&limit=50`)
          .then((res) => res.json())
          .then((payload) =>
            payload.success
              ? (payload.data as {
                  id: string;
                  media_type?: string;
                  media_url?: string;
                  thumbnail_url?: string;
                }[])
              : []
          )
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return;
      const thumbs: Record<string, string> = {};
      const vids: Record<string, string> = {};
      for (const list of lists) {
        for (const media of list) {
          const url = media.thumbnail_url ?? media.media_url;
          if (url) thumbs[media.id] = url;
          if (media.media_type === "VIDEO" && media.media_url) {
            vids[media.id] = media.media_url;
          }
        }
      }
      setThumbnails(thumbs);
      setVideos(vids);
      writeCache(cacheKey, { thumbs, videos: vids });
    });

    return () => {
      cancelled = true;
    };
  }, [automations]);

  // Close the reel lightbox on Escape.
  useEffect(() => {
    if (!playingVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayingVideo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playingVideo]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await fetch(`/api/automations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a))
      );
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  }

  async function deleteAutomation(id: string) {
    if (!confirm(t("Delete this campaign? This cannot be undone."))) return;
    try {
      await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  // The copy is made server-side from the stored campaign, so settings this
  // list never loads (the DM trigger, the follow-up, the link button label)
  // still come along.
  async function duplicateAutomation(id: string) {
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/automations/duplicate?id=${id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) void fetchAutomations();
      else console.error("Duplicate failed:", data.error);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="panel rounded p-6 h-36" />
        ))}
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = automations.filter((a) => {
    if (statusFilter === "active" && !a.isActive) return false;
    if (statusFilter === "paused" && a.isActive) return false;
    if (!query) return true;
    return (
      a.name.toLowerCase().includes(query) ||
      a.keywords.some((k) => k.toLowerCase().includes(query)) ||
      a.dmMessage.toLowerCase().includes(query)
    );
  });

  const activeCount = automations.filter((a) => a.isActive).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="自動回覆活動"
        actions={
          accounts.length > 1 && (
            <AccountSelect accounts={accounts} value={selectedAccountId} onChange={handleAccountChange} />
          )
        }
      />

      <div className="flex flex-wrap gap-3 sm:gap-4">
        <Link
          href="/campaigns/new"
          className="inline-flex h-12 items-center gap-3 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-5" strokeWidth={2.5} />
          建立新活動
        </Link>
        <Link
          href="/campaigns/import"
          className="inline-flex h-12 items-center gap-3 rounded-xl border border-border bg-secondary px-6 text-base text-secondary-foreground hover:bg-border/60"
        >
          <Plus className="size-5" />
          大量匯入活動
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="啟用中的活動" value={activeCount} />
        <StatCard label="已暫停的活動" value={automations.length - activeCount} />
        <StatCard label="聯絡人數量" value={summary?.contactsCount ?? 0} />
        <StatCard label="平均點擊率" value={`${summary?.ctrThisMonth ?? 0}%`} />
      </div>

      {/* Search + status filter */}
      {automations.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋活動名稱、關鍵字或訊息..."
              className="h-12 w-full rounded-xl border border-border bg-background pr-4 pl-11 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div className="inline-flex shrink-0 items-center gap-1">
            {(["all", "active", "paused"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-4 py-2 text-[15px] transition-colors ${
                  statusFilter === s
                    ? "bg-segment font-medium text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {{ all: "全部", active: "啟用中", paused: "已暫停" }[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {automations.length === 0 && (
        <div className="rounded-xl border border-border p-8 text-center sm:p-12">
          <h3 className="mb-2 text-lg font-semibold">{t("No campaigns yet")}</h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
            {t("Create your first comment-to-DM campaign to turn a post or reel into a measurable conversation flow.")}
          </p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            建立新活動
          </Link>
        </div>
      )}

      {/* No matches for the current filter */}
      {automations.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          {t("No campaigns match your search.")}
        </div>
      )}

      {/* Campaign table */}
      {filtered.length > 0 && (
        <div>
          <div className="hidden items-center rounded-xl bg-secondary px-12 py-3 text-[15px] text-secondary-foreground md:flex">
            <span className="flex-1">活動設定</span>
            <span className="w-24 text-center">狀態</span>
            <span className="w-32 text-center">操作</span>
          </div>

          <div className="divide-y divide-border px-0 md:px-7">
            {filtered.map((auto) => {
              const thumb = auto.postId ? thumbnails[auto.postId] : undefined;
              const twoStep = auto.openingDmEnabled || auto.analytics.claims > 0;
              return (
                <div
                  key={auto.id}
                  onClick={() => router.push(`/campaigns/${auto.id}`)}
                  className="flex cursor-pointer flex-wrap items-center gap-x-6 gap-y-4 py-7 md:flex-nowrap"
                >
                  {/* Thumbnail */}
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {thumb && auto.postUrl ? (
                      // Hover: the image blurs under a half-orange veil reading
                      // 前往貼文; a click opens the post.
                      <a
                        href={auto.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="前往貼文"
                        className="group relative block size-28 overflow-hidden rounded-xl sm:size-34"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt={t("Campaign post")}
                          className="size-full object-cover transition duration-200 group-hover:blur-[3px] group-focus-visible:blur-[3px]"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-[#FF6900]/50 text-base font-bold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                          前往貼文
                        </span>
                      </a>
                    ) : thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={t("Campaign post")} className="size-28 rounded-xl object-cover sm:size-34" />
                    ) : (
                      <div className="size-28 rounded-xl bg-muted sm:size-34" />
                    )}
                  </div>

                  {/* Settings summary */}
                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3
                        className={`truncate text-xl font-bold ${
                          auto.isActive ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {auto.name}
                      </h3>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-medium ${
                          auto.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {auto.isActive ? "啟用中" : "已暫停"}
                      </span>
                      {auto.pendingNextReel && (
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-sm font-medium text-warning">
                          {t("Waiting for next reel")}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PlatformTag account={auto.instagramAccount} muted={!auto.isActive} />
                      <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1 text-sm text-secondary-foreground">
                        留言關鍵字
                        <span className="h-3.5 w-px bg-border" />
                        {auto.matchAnyWord ? "任何留言" : auto.keywords.join("、")}
                      </span>
                      {auto.requireFollow && (
                        <span className="rounded-lg border border-border px-3 py-1 text-sm text-secondary-foreground">
                          先追蹤再傳送
                        </span>
                      )}
                    </div>

                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{auto.analytics.ctr}% 點擊率</span>
                      <span className="text-border">|</span>
                      <span>{auto.analytics.sent} 則已傳送</span>
                      {twoStep && (
                        <>
                          <span className="text-border">|</span>
                          <span>{auto.analytics.claims} 次領取按鈕</span>
                        </>
                      )}
                      <span className="text-border">|</span>
                      <span>{auto.analytics.clicks} 次連結按鈕</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{auto.analytics.runs} 次留言觸發</span>
                      <span className="text-border">|</span>
                      <span>{auto.analytics.skipped} 則已略過</span>
                      <span className="text-border">|</span>
                      <span>{auto.analytics.failed} 則失敗</span>
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex w-24 shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={auto.isActive}
                      aria-label={auto.isActive ? "暫停活動" : "啟用活動"}
                      onClick={() => toggleActive(auto.id, auto.isActive)}
                      className={`relative h-7 w-14 rounded-full transition-colors ${
                        auto.isActive ? "bg-primary" : "bg-border"
                      }`}
                    >
                      <span
                        className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all ${
                          auto.isActive ? "left-1" : "left-8"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="relative flex w-32 shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex overflow-hidden rounded-xl border border-border">
                      <Link
                        href={`/campaigns/${auto.id}/edit`}
                        className="px-4 py-2 text-sm text-secondary-foreground hover:bg-muted"
                      >
                        編輯
                      </Link>
                      <button
                        type="button"
                        onClick={() => setMenuOpenId((cur) => (cur === auto.id ? null : auto.id))}
                        aria-label={t("More actions")}
                        className="border-l border-border px-3 text-secondary-foreground hover:bg-muted"
                      >
                        <Ellipsis className="size-4" />
                      </button>
                    </div>
                    {menuOpenId === auto.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute top-full right-0 z-20 mt-1 w-28 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
                          {auto.postUrl && (
                            <a
                              href={auto.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setMenuOpenId(null)}
                              className="block px-4 py-2.5 text-sm text-foreground hover:bg-muted"
                            >
                              前往貼文
                            </a>
                          )}
                          <button
                            onClick={() => void duplicateAutomation(auto.id)}
                            className="block w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            複製活動
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              void deleteAutomation(auto.id);
                            }}
                            className="block w-full px-4 py-2.5 text-left text-sm text-primary hover:bg-muted"
                          >
                            刪除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reel lightbox */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className="relative flex max-w-full flex-col items-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 text-sm">
              {playingVideo.postUrl && (
                <a
                  href={playingVideo.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-300 hover:text-white"
                >
                  {t("Open on Instagram")}
                </a>
              )}
              <button
                type="button"
                onClick={() => setPlayingVideo(null)}
                className="text-zinc-300 hover:text-white"
              >
                {t("Close")}
              </button>
            </div>
            <video
              src={playingVideo.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[80vh] max-w-full rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
