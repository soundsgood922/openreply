"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Post Picker
 *
 * Grid of Instagram post thumbnails, selectable.
 * Fetches from /api/instagram/posts.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { readCache, writeCache } from "@/lib/client-cache";
import { Search } from "lucide-react";

const PAGE_SIZE = 60;

interface InstagramPost {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
}

interface PostPickerProps {
  selectedPostId: string | null;
  instagramAccountId?: string | null;
  /** postId -> name of the campaign already using it. Flagged in the grid. */
  usedPostIds?: Record<string, string>;
  onSelect: (
    postId: string,
    postUrl?: string,
    thumbUrl?: string,
    caption?: string
  ) => void;
}

export default function PostPicker({
  selectedPostId,
  instagramAccountId,
  usedPostIds,
  onSelect,
}: PostPickerProps) {
  const { t } = useI18n();
  const [limitations, setLimitations] = useState<string[]>([]);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The post currently hovered — its video (if it's a reel) plays a preview.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // The grid loads the whole library (all=true). On accounts with hundreds of
  // posts, rendering every tile at once is enough to make mobile Safari drop
  // the page, so they are revealed in batches.
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (instagramAccountId) {
      params.set("instagramAccountId", instagramAccountId);
    }
    // Load the full library so older posts/reels are selectable, not just the
    // most recent page.
    params.set("all", "true");

    // Show the cached library instantly (stale-while-revalidate), then refresh.
    const cacheKey = `ig-posts:${instagramAccountId ?? "default"}`;
    const cached = readCache<InstagramPost[]>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    // A new account starts clean: an error or posts from the previous account
    // must not carry over while this one loads.
    setError(null);
    if (cached.data) {
      setPosts(cached.data);
      setLoading(false);
    } else {
      setPosts([]);
      setLoading(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    fetch(`/api/instagram/posts${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setPosts(data.data);
          setLimitations(data.limitations ?? []);
          writeCache(cacheKey, data.data);
        } else if (!cached.data) {
          setError(data.error ?? "Failed to load posts");
        }
      })
      .catch(() => {
        if (!cancelled && !cached.data) setError("Failed to load posts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instagramAccountId]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-background" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">{error === "Failed to load posts" ? t("Failed to load posts") : error}</p>
        <p className="text-xs text-zinc-500 mt-1">{t("Connect your Instagram account first")}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">{t("No posts found")}</p>
      </div>
    );
  }

  const matching = query.trim()
    ? posts.filter((p) =>
        (p.caption ?? "").toLowerCase().includes(query.trim().toLowerCase())
      )
    : posts;

  const visible = matching.slice(0, shown);
  const remaining = matching.length - visible.length;

  return (
    <div className="space-y-3">
      {limitations.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">{note}</p>
      ))}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Back to one batch on every new search, so a grid expanded under
            // an earlier query does not stay expanded once it is cleared.
            setShown(PAGE_SIZE);
          }}
          placeholder="依貼文內容搜尋..."
          className="h-12 w-full rounded-xl bg-background pr-4 pl-11 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none"
        />
      </div>
      <p className="px-4 text-xs text-secondary-foreground">※ 協作貼文，僅限發布者可設定自動回覆</p>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          找不到含「{query}」的貼文
        </p>
      ) : (
        <>
          {/* auto-rows-min + content-start keep each row at its natural height
              instead of sharing out the scroll box's height. */}
          <div className="grid max-h-80 auto-rows-min grid-cols-3 content-start gap-3 overflow-y-auto sm:grid-cols-4">
            {visible.map((post) => {
              const isSelected = selectedPostId === post.id;
              const usedByName = usedPostIds?.[post.id];
              const isUsed = Boolean(usedByName) && !isSelected;
              const thumb = post.thumbnail_url ?? post.media_url;
              const isVideo = post.media_type === "VIDEO";
              const showVideo = isVideo && hoveredId === post.id && Boolean(post.media_url);
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onSelect(post.id, post.permalink, thumb, post.caption)}
                  onMouseEnter={() => setHoveredId(post.id)}
                  onMouseLeave={() => setHoveredId((cur) => (cur === post.id ? null : cur))}
                  aria-pressed={isSelected}
                  title={isUsed && usedByName ? `已設活動：${usedByName}` : undefined}
                  className={`relative aspect-square overflow-hidden rounded-lg ${
                    isSelected ? "ring-3 ring-primary" : "hover:opacity-90"
                  }`}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={post.caption?.slice(0, 50) ?? "貼文"}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#9e9e9e] text-xs text-white">
                      貼文無圖片
                    </div>
                  )}
                  {showVideo && (
                    <video
                      src={post.media_url}
                      poster={thumb}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="none"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {isUsed && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
                      已設活動
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute inset-x-0 bottom-0 bg-primary py-1 text-xs font-medium text-white">
                      已選擇
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="h-11 w-full rounded-xl bg-background text-sm text-secondary-foreground hover:text-foreground"
            >
              顯示更早的貼文
            </button>
          )}
        </>
      )}
    </div>
  );
}
