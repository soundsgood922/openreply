"use client";

/**
 * Campaign Builder (per the Figma designs, 2026-11)
 *
 * The left column is split into three steps — 貼文 / 留言 / 私訊 — that also
 * switch the phone preview on the right. Used for both creating and editing.
 *
 * Delivery is one of two modes:
 * - 直接傳送 1 則訊息: the comment gets the link DM straight away;
 * - 兩段式訊息 (Instagram only): the first DM asks for a follow with a button;
 *   a tap is checked against Instagram and only a follower gets the link.
 *   Stored as requireFollow with the first DM as the follow prompt (the old
 *   separate "opening DM" is no longer offered). Facebook cannot tell who
 *   follows a Page, so a Page campaign is always one message.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { type AccountOption } from "@/components/account-select";
import PostPicker from "@/components/post-picker";
import CampaignPreview, { type PreviewTab } from "@/components/campaign-preview";
import { readCache, writeCache } from "@/lib/client-cache";
import { DEFAULT_FOLLOW_PROMPT_BUTTON, DEFAULT_FOLLOW_PROMPT_MESSAGE } from "@/lib/automation/follow-prompt";
import { IMPORT_QUEUE_KEY, IMPORT_ACCOUNT_KEY, type ImportRow } from "@/lib/import-queue";

type TriggerScope = "specific" | "any" | "next";
type MatchMode = "specific" | "any";
type DmMode = "one" | "two";
type Step = "post" | "comment" | "dm";

const MAX_REPLIES = 3;
const MAX_LINKS = 2;

interface LoadedCampaign {
  id: string;
  name: string;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch?: boolean;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  linkButtonLabel: string | null;
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  followUpEnabled: boolean;
  followUpMessage: string | null;
  followUpDelayMinutes: number | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  isActive: boolean;
  instagramAccountId: string;
  trackedLinks?: { destinationUrl: string; label?: string | null }[];
}

interface CampaignBuilderProps {
  mode: "new" | "edit";
  campaignId?: string;
}

/* ----------------------------- small parts ----------------------------- */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[15px] text-secondary-foreground">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 px-4 text-xs text-secondary-foreground">※ {children}</p>;
}

/** An option card: orange outline and text when chosen. */
function Choice({
  selected,
  onSelect,
  disabled,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex h-11 w-full items-center rounded-xl border bg-background px-4 text-left text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-primary font-medium text-primary"
          : "border-border text-muted-foreground hover:border-border-hover"
      }`}
    >
      {children}
    </button>
  );
}

/** A switch inside an outlined row, as in the designs. */
function ToggleCard({
  on,
  onToggle,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex h-11 w-full items-center gap-4 rounded-xl border bg-background px-4 text-left text-[15px] transition-colors ${
        on ? "border-primary font-medium text-primary" : "border-border text-muted-foreground"
      }`}
    >
      <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}>
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      {children}
    </button>
  );
}

const filledInput =
  "h-11 w-full rounded-xl bg-secondary px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none";
const filledArea =
  "w-full resize-none rounded-xl bg-secondary px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none";
const addButton =
  "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-[15px] text-secondary-foreground hover:bg-muted";

function platformName(account: AccountOption, all: AccountOption[]) {
  const facebook = account.provider === "FACEBOOK";
  const base = facebook ? "Facebook 粉絲專頁" : "Instagram 帳號";
  const shared = all.filter((a) => (a.provider === "FACEBOOK") === facebook).length > 1;
  return shared ? `${base} · ${account.username}` : base;
}

function splitKeywords(text: string) {
  return text
    .split(/[,，、]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/* ----------------------------- builder ----------------------------- */

export default function CampaignBuilder({ mode, campaignId }: CampaignBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("post");

  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const [triggerScope, setTriggerScope] = useState<TriggerScope>("specific");
  const [postId, setPostId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [postThumb, setPostThumb] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState("");
  // postId -> campaign already using it, flagged 已設活動 in the picker.
  const [usedPosts, setUsedPosts] = useState<Record<string, string>>({});

  const [matchMode, setMatchMode] = useState<MatchMode>("specific");
  const [keywordText, setKeywordText] = useState("");
  // Off = the comment only has to contain a keyword (the default for Chinese).
  const [wholeWordMatch, setWholeWordMatch] = useState(false);

  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessages, setPublicReplyMessages] = useState<string[]>([""]);

  const [dmMode, setDmMode] = useState<DmMode>("one");
  const [openingText, setOpeningText] = useState("");
  const [openingButton, setOpeningButton] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);

  // Kept as loaded so a save does not drop them; no longer edited here.
  const [followUp, setFollowUp] = useState({ enabled: false, message: "", delay: 0 });

  // CSV import queue. When present, each save advances to the next row.
  const [importQueue, setImportQueue] = useState<ImportRow[] | null>(null);
  const [importTotal, setImportTotal] = useState(0);

  const keywords = useMemo(() => splitKeywords(keywordText), [keywordText]);
  const account = accounts.find((a) => a.id === selectedAccountId);
  const isFacebook = account?.provider === "FACEBOOK";
  const username = account?.username ?? "yourbrand";
  // A Facebook Page cannot check follows, so it is always one message.
  const effectiveDmMode: DmMode = isFacebook ? "one" : dmMode;

  /* -------- unsaved-changes guard -------- */
  const snapshot = JSON.stringify({
    name, selectedAccountId, triggerScope, postId, matchMode, keywordText, wholeWordMatch,
    publicReplyEnabled, publicReplyMessages, dmMode, openingText, openingButton, dmMessage, links,
  });
  const [baseline, setBaseline] = useState<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    // The first settled state (after an edit loads, or the accounts arrive) is
    // what "unchanged" means.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (baseline === null && !loading && accounts.length > 0) setBaseline(snapshot);
  }, [baseline, loading, accounts.length, snapshot]);
  const dirty = baseline !== null && baseline !== snapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = "尚未儲存的變更將會遺失，確定要離開嗎？";
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
    };
    // In-app links do not fire beforeunload, so catch their clicks.
    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm(warn)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  /* -------- data -------- */

  // The connected account's avatar for the preview (cache-first).
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    const cacheKey = `ig-avatar:${selectedAccountId}`;
    const cached = readCache<string | null>(cacheKey, 30 * 60 * 1000);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached.data !== null) setAvatarUrl(cached.data);
    fetch(`/api/instagram/profile?${new URLSearchParams({ instagramAccountId: selectedAccountId })}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const url = d.success ? d.data.profilePictureUrl ?? null : null;
        setAvatarUrl(url);
        writeCache(cacheKey, url);
      })
      .catch(() => {
        if (!cancelled && cached.data === null) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        const next: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(next);
        // Instagram first, as the design lists it.
        const preferred = next.find((a) => a.provider !== "FACEBOOK") ?? next[0];
        setSelectedAccountId((prev) => prev || preferred?.id || "");
      })
      .catch(() => setAccounts([]));
  }, []);

  // Prefill when editing.
  useEffect(() => {
    if (mode !== "edit" || !campaignId) return;
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return setNotFound(true);
        const c = (payload.data as LoadedCampaign[]).find((x) => x.id === campaignId);
        if (!c) return setNotFound(true);
        setName(c.name);
        setSelectedAccountId(c.instagramAccountId);
        setTriggerScope(c.matchAnyPost ? "any" : c.pendingNextReel ? "next" : "specific");
        setPostId(c.postId);
        setPostUrl(c.postUrl);
        setMatchMode(c.matchAnyWord ? "any" : "specific");
        setKeywordText(c.keywords.join(", "));
        setWholeWordMatch(c.wholeWordMatch ?? true);
        setPublicReplyEnabled(c.publicReplyEnabled);
        setPublicReplyMessages(
          c.publicReplyMessages?.length
            ? c.publicReplyMessages.slice(0, MAX_REPLIES)
            : c.publicReplyMessage
              ? [c.publicReplyMessage]
              : [""]
        );
        // Older campaigns may use the retired opening DM; a follow gate or an
        // opening DM both read as 兩段式 now (Facebook falls back to one).
        setDmMode(c.requireFollow || c.openingDmEnabled ? "two" : "one");
        setOpeningText(c.followPromptMessage || c.openingDmMessage || "");
        setOpeningButton(c.followPromptButtonLabel || c.openingDmButtonLabel || "");
        setDmMessage(c.dmMessage);
        setLinks(
          (c.trackedLinks ?? []).slice(0, MAX_LINKS).map((l, i) => ({
            url: l.destinationUrl,
            label: (i === 0 ? c.linkButtonLabel : l.label) ?? "",
          }))
        );
        setFollowUp({
          enabled: c.followUpEnabled ?? false,
          message: c.followUpMessage ?? "",
          delay: c.followUpDelayMinutes ?? 0,
        });
        setIsActive(c.isActive);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [mode, campaignId]);

  // Posts on the selected account already used by another campaign.
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled || !payload.success) return;
        const map: Record<string, string> = {};
        for (const a of payload.data as LoadedCampaign[]) {
          if (!a.postId || a.instagramAccountId !== selectedAccountId) continue;
          if (mode === "edit" && a.id === campaignId) continue;
          map[a.postId] = a.name;
        }
        setUsedPosts(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, mode, campaignId]);

  function prefillFromRow(row: ImportRow) {
    setName(row.name ?? "");
    setTriggerScope("specific");
    setPostId(null);
    setPostUrl(null);
    setPostThumb(null);
    setPostCaption("");
    setMatchMode("specific");
    setKeywordText((row.keywords ?? []).join(", "));
    setDmMessage(row.dmMessage ?? "");
    setPublicReplyEnabled(Boolean(row.publicReply));
    setPublicReplyMessages(row.publicReply ? [row.publicReply] : [""]);
    setDmMode("one");
    setLinks(row.trackedUrl ? [{ url: row.trackedUrl, label: "" }] : []);
    setError(null);
    setStep("post");
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode !== "new") return;
    try {
      const raw = window.localStorage.getItem(IMPORT_QUEUE_KEY);
      const acct = window.localStorage.getItem(IMPORT_ACCOUNT_KEY);
      if (!raw) return;
      const queue = JSON.parse(raw) as ImportRow[];
      if (!Array.isArray(queue) || queue.length === 0) return;
      setImportQueue(queue);
      setImportTotal(queue.length);
      if (acct) setSelectedAccountId(acct);
      prefillFromRow(queue[0]);
    } catch {
      // ignore a malformed queue
    }
  }, [mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function selectAccount(id: string) {
    setSelectedAccountId(id);
    setPostId(null);
    setPostUrl(null);
    setPostThumb(null);
    setPostCaption("");
    const next = accounts.find((a) => a.id === id);
    if (next?.provider === "FACEBOOK" && triggerScope === "next") setTriggerScope("specific");
  }

  function fail(message: string, at: Step) {
    setError(message);
    setStep(at);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(activeValue: boolean) {
    setError(null);

    if (!selectedAccountId) return fail("請先連接帳號。", "post");
    if (triggerScope === "specific" && !postId) return fail("請選擇一篇貼文／Reel。", "post");
    if (matchMode === "specific" && keywords.length === 0)
      return fail("請輸入至少一個留言關鍵字，或改選「任何留言文字」。", "comment");
    if (!dmMessage.trim()) return fail("請輸入私訊的訊息內容。", "dm");
    if (links.some((l) => !l.url.trim())) return fail("請填寫連結網址，或移除空白的連結按鈕。", "dm");

    setSaving(true);
    const twoStep = effectiveDmMode === "two";
    const [first, second] = links;
    const payload = {
      name: name.trim() || `Campaign for @${username}`,
      instagramAccountId: selectedAccountId,
      postId: triggerScope === "specific" ? postId : null,
      postUrl: triggerScope === "specific" ? postUrl : null,
      matchAnyPost: triggerScope === "any",
      pendingNextReel: triggerScope === "next",
      matchAnyWord: matchMode === "any",
      keywords: matchMode === "any" ? [] : keywords,
      wholeWordMatch,
      dmTriggerEnabled: false,
      dmMessage,
      // The two-step flow is the follow gate with its own first message; the
      // separate opening DM is retired.
      openingDmEnabled: false,
      openingDmMessage: null,
      openingDmButtonLabel: null,
      requireFollow: twoStep,
      followPromptMessage: twoStep ? openingText.trim() : "",
      followPromptButtonLabel: twoStep ? openingButton.trim() || DEFAULT_FOLLOW_PROMPT_BUTTON : "",
      publicReplyEnabled,
      publicReplyMessages: publicReplyEnabled
        ? publicReplyMessages.map((m) => m.trim()).filter(Boolean).slice(0, MAX_REPLIES)
        : [],
      trackedDestinationUrl: first?.url.trim() ?? "",
      linkButtonLabel: first?.label.trim() || "開啟連結",
      secondaryDestinationUrl: second?.url.trim() ?? "",
      secondaryButtonLabel: second?.label.trim() || "開啟連結",
      followUpEnabled: followUp.enabled,
      followUpMessage: followUp.enabled ? followUp.message.trim() : "",
      followUpDelayMinutes: followUp.enabled ? followUp.delay : 0,
      isActive: activeValue,
    };

    try {
      const res =
        mode === "new"
          ? await fetch("/api/automations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/automations?id=${campaignId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const data = await res.json();
      if (data.success) {
        if (triggerScope === "specific" && postId) {
          const assigned = postId;
          setUsedPosts((prev) => ({ ...prev, [assigned]: payload.name }));
        }
        if (importQueue && importQueue.length > 1) {
          const remaining = importQueue.slice(1);
          try {
            window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(remaining));
          } catch {
            // ignore
          }
          setImportQueue(remaining);
          prefillFromRow(remaining[0]);
          setBaseline(null);
          setSaving(false);
          window.scrollTo({ top: 0 });
          return;
        }
        if (importQueue) {
          try {
            window.localStorage.removeItem(IMPORT_QUEUE_KEY);
            window.localStorage.removeItem(IMPORT_ACCOUNT_KEY);
          } catch {
            // ignore
          }
        }
        leaving.current = true;
        router.push("/campaigns");
        router.refresh();
      } else {
        const fieldErrors = data.details?.fieldErrors as Record<string, string[]> | undefined;
        const firstField = fieldErrors && Object.keys(fieldErrors)[0];
        setError(
          firstField ? `${firstField}: ${fieldErrors[firstField][0]}` : data.error ?? "儲存失敗，請再試一次。"
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("儲存失敗，請再試一次。");
    } finally {
      setSaving(false);
    }
  }

  function skipRow() {
    if (!importQueue) return;
    setError(null);
    if (importQueue.length > 1) {
      const remaining = importQueue.slice(1);
      try {
        window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(remaining));
      } catch {
        // ignore
      }
      setImportQueue(remaining);
      prefillFromRow(remaining[0]);
      setBaseline(null);
      window.scrollTo({ top: 0 });
      return;
    }
    try {
      window.localStorage.removeItem(IMPORT_QUEUE_KEY);
      window.localStorage.removeItem(IMPORT_ACCOUNT_KEY);
    } catch {
      // ignore
    }
    leaving.current = true;
    router.push("/campaigns");
    router.refresh();
  }

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  if (notFound) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("Campaign not found.")}</p>
        <button
          onClick={() => router.push("/campaigns")}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm text-secondary-foreground hover:bg-muted"
        >
          {t("Back to campaigns")}
        </button>
      </div>
    );
  }

  const previewTab: PreviewTab = step === "post" ? "post" : step === "comment" ? "comments" : "dm";
  const steps: { key: Step; label: string }[] = [
    { key: "post", label: "貼文" },
    { key: "comment", label: "留言" },
    { key: "dm", label: "私訊" },
  ];

  return (
    <div className="space-y-8">
      {importQueue && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">
            匯入中：第 {importTotal - importQueue.length + 1} ／ {importTotal} 筆。
          </span>{" "}
          <span className="text-secondary-foreground">欄位已依 CSV 帶入，請選貼文、確認內容後儲存，或按「略過」。</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-6">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
            {mode === "new" ? "新增活動" : "編輯活動"}
          </h1>
          <span
            className={`shrink-0 rounded-full px-4 py-2 text-[15px] ${
              mode === "edit" && isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {mode === "edit" && isActive ? "啟用中" : "未啟用"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {importQueue && (
            <button
              type="button"
              onClick={skipRow}
              disabled={saving}
              className="h-12 rounded-xl border border-border px-5 text-[17px] text-secondary-foreground hover:bg-muted disabled:opacity-50"
            >
              {importQueue.length > 1 ? "略過" : "略過並結束"}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="h-12 rounded-xl bg-primary/15 px-6 text-[17px] font-bold text-primary hover:bg-primary/25 disabled:opacity-50"
          >
            {mode === "edit" && isActive ? "儲存並暫停" : "儲存但不啟用"}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="h-12 rounded-xl bg-primary px-6 text-[17px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "儲存中…" : mode === "new" ? "啟用活動" : isActive ? "儲存變更" : "儲存並啟用"}
          </button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,436px)_1fr] lg:gap-20">
        {/* Left: fields */}
        <div className="min-w-0 space-y-8">
          {error && (
            <div className="rounded-xl border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
          )}

          <div>
            <FieldLabel>活動名稱</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="輸入活動名稱，如：留言領 AI 工具"
              maxLength={100}
              className="h-16 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>

          <div>
            <FieldLabel>設定順序</FieldLabel>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border p-2">
              {steps.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  aria-pressed={step === s.key}
                  className={`h-11 rounded-xl text-[15px] transition-colors ${
                    step === s.key ? "bg-segment font-medium text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 貼文 */}
          {step === "post" && (
            <>
              {accounts.length > 1 && (
                <div>
                  <FieldLabel>選擇帳號平台</FieldLabel>
                  <div className="space-y-3">
                    {[...accounts]
                      .sort((a, b) => Number(a.provider === "FACEBOOK") - Number(b.provider === "FACEBOOK"))
                      .map((a) => (
                        <Choice key={a.id} selected={a.id === selectedAccountId} onSelect={() => selectAccount(a.id)}>
                          {platformName(a, accounts)}
                        </Choice>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <FieldLabel>選擇指定內容</FieldLabel>
                <div className="space-y-3">
                  <Choice selected={triggerScope === "specific"} onSelect={() => setTriggerScope("specific")}>
                    指定一篇貼文／Reel
                  </Choice>
                  {triggerScope === "specific" && (
                    <div className="rounded-xl bg-secondary p-3">
                      <PostPicker
                        selectedPostId={postId}
                        instagramAccountId={selectedAccountId}
                        usedPostIds={usedPosts}
                        onSelect={(id, url, thumb, caption) => {
                          setPostId(id);
                          setPostUrl(url ?? null);
                          setPostThumb(thumb ?? null);
                          setPostCaption(caption ?? "");
                        }}
                      />
                    </div>
                  )}
                  <Choice selected={triggerScope === "any"} onSelect={() => setTriggerScope("any")}>
                    帳號內任何貼文／Reel
                  </Choice>
                  {!isFacebook && (
                    <Choice selected={triggerScope === "next"} onSelect={() => setTriggerScope("next")}>
                      下一篇貼文／Reel
                    </Choice>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 留言 */}
          {step === "comment" && (
            <>
              <div>
                <FieldLabel>留言須符合</FieldLabel>
                <div className="space-y-3">
                  <Choice selected={matchMode === "specific"} onSelect={() => setMatchMode("specific")}>
                    指定留言關鍵字
                  </Choice>
                  <Choice selected={matchMode === "any"} onSelect={() => setMatchMode("any")}>
                    任何留言文字
                  </Choice>
                </div>
              </div>

              {matchMode === "specific" && (
                <div>
                  <FieldLabel>留言關鍵字（多個關鍵字，請以逗號 , 分隔）</FieldLabel>
                  <input
                    value={keywordText}
                    onChange={(e) => setKeywordText(e.target.value)}
                    placeholder="輸入一個或多個以上的關鍵字"
                    className={filledInput}
                  />
                  <div className="mt-3">
                    <ToggleCard on={wholeWordMatch} onToggle={() => setWholeWordMatch(!wholeWordMatch)}>
                      須完全符合關鍵字才觸發
                    </ToggleCard>
                  </div>
                  <Note>例如設定關鍵字「溝通」，留言「溝通好難」就不會觸發</Note>
                </div>
              )}

              <div>
                <FieldLabel>自動回覆留言</FieldLabel>
                <div className="space-y-3">
                  <ToggleCard on={publicReplyEnabled} onToggle={() => setPublicReplyEnabled(!publicReplyEnabled)}>
                    開啟下方公開回覆留言
                  </ToggleCard>
                  {publicReplyEnabled && (
                    <>
                      {publicReplyMessages.map((msg, i) => (
                        <div key={i} className="relative">
                          <input
                            value={msg}
                            onChange={(e) =>
                              setPublicReplyMessages((prev) => prev.map((m, idx) => (idx === i ? e.target.value : m)))
                            }
                            placeholder={["已私訊給你囉！", "快去打開訊息吧 📩", "嗨～私訊你囉 🙌"][i] ?? "輸入回覆內容"}
                            maxLength={1000}
                            className={`${filledInput} ${publicReplyMessages.length > 1 ? "pr-10" : ""}`}
                          />
                          {publicReplyMessages.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setPublicReplyMessages((prev) => prev.filter((_, idx) => idx !== i))}
                              aria-label="移除這則回覆"
                              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {publicReplyMessages.length < MAX_REPLIES && (
                        <button
                          type="button"
                          onClick={() => setPublicReplyMessages((prev) => [...prev, ""])}
                          className={addButton}
                        >
                          <Plus className="size-4" />
                          新增隨機回覆（最多 {MAX_REPLIES} 則）
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 私訊 */}
          {step === "dm" && (
            <>
              <div>
                <FieldLabel>選擇私訊方式</FieldLabel>
                <div className="space-y-3">
                  <Choice selected={effectiveDmMode === "one"} onSelect={() => setDmMode("one")}>
                    直接傳送 1 則訊息
                  </Choice>
                  <Choice selected={effectiveDmMode === "two"} onSelect={() => setDmMode("two")} disabled={isFacebook}>
                    兩段式訊息（先要求追蹤，再傳連結）
                  </Choice>
                </div>
                <Note>
                  兩段式訊息功能，僅限 Instagram 使用{isFacebook ? "（Facebook 無法確認是否追蹤）" : ""}
                </Note>
              </div>

              {effectiveDmMode === "two" && (
                <div className="space-y-6 border-b border-border pb-8">
                  <div>
                    <FieldLabel>開頭訊息</FieldLabel>
                    <textarea
                      value={openingText}
                      onChange={(e) => setOpeningText(e.target.value)}
                      placeholder={DEFAULT_FOLLOW_PROMPT_MESSAGE}
                      rows={5}
                      maxLength={640}
                      className={filledArea}
                    />
                  </div>
                  <div>
                    <FieldLabel>開頭訊息按鈕文字</FieldLabel>
                    <input
                      value={openingButton}
                      onChange={(e) => setOpeningButton(e.target.value)}
                      placeholder={DEFAULT_FOLLOW_PROMPT_BUTTON}
                      maxLength={20}
                      className={filledInput}
                    />
                  </div>
                </div>
              )}

              <div>
                <FieldLabel>訊息內容</FieldLabel>
                <textarea
                  value={dmMessage}
                  onChange={(e) => setDmMessage(e.target.value)}
                  placeholder="輸入訊息內容"
                  rows={4}
                  maxLength={1000}
                  className={filledArea}
                />
                <p className="mt-2 px-4 text-xs text-secondary-foreground">可輸入 {"{username}"} 帶入粉絲名稱</p>
              </div>

              <div className="space-y-6">
                {links.map((link, i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[15px] text-secondary-foreground">連結按鈕{links.length > 1 ? ` ${i + 1}` : ""}</p>
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        移除
                      </button>
                    </div>
                    <input
                      value={link.url}
                      onChange={(e) =>
                        setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))
                      }
                      placeholder="輸入連結網址，如：https://metavoice.com.tw"
                      className={filledInput}
                    />
                    <input
                      value={link.label}
                      onChange={(e) =>
                        setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, label: e.target.value } : l)))
                      }
                      placeholder="輸入按鈕文字"
                      maxLength={20}
                      className={filledInput}
                    />
                  </div>
                ))}
                {links.length < MAX_LINKS && (
                  <button
                    type="button"
                    onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
                    className={addButton}
                  >
                    <Plus className="size-4" />
                    新增連結按鈕（最多 {MAX_LINKS} 個）
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: preview */}
        <div className="min-w-0">
          <p className="mb-6 text-[15px] text-secondary-foreground">預覽</p>
          <div className="flex justify-center lg:sticky lg:top-6">
            <CampaignPreview
              tab={previewTab}
              onTabChange={() => {}}
              hideTabs
              username={username}
              avatarUrl={avatarUrl}
              postThumb={postThumb}
              caption={postCaption}
              sampleComment={keywords[0] ?? ""}
              dmTriggerEnabled={false}
              publicReplyEnabled={publicReplyEnabled}
              publicReplyMessage={publicReplyMessages.find((m) => m.trim()) ?? ""}
              openingDmEnabled={false}
              openingDmMessage=""
              openingDmButtonLabel=""
              revealMessage={dmMessage}
              hasLink={Boolean(links[0]?.url.trim())}
              linkButtonLabel={links[0]?.label || "開啟連結"}
              linkUrl={links[0]?.url.trim() || undefined}
              hasSecondLink={Boolean(links[1]?.url.trim())}
              secondLinkButtonLabel={links[1]?.label || "開啟連結"}
              requireFollow={effectiveDmMode === "two"}
              followPromptMessage={openingText || DEFAULT_FOLLOW_PROMPT_MESSAGE}
              followPromptButtonLabel={openingButton || DEFAULT_FOLLOW_PROMPT_BUTTON}
              followUpEnabled={followUp.enabled}
              followUpMessage={followUp.message}
              followUpDelayMinutes={followUp.delay}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
