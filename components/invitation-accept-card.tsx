"use client";

import { useState } from "react";

interface InvitationAcceptCardProps {
  token: string;
  isSignedIn: boolean;
  invitedEmail: string;
}

const BUTTON =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

export default function InvitationAcceptCard({
  token,
  isSignedIn,
  invitedEmail,
}: InvitationAcceptCardProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function acceptInvite() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/workspace/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json();
    if (payload.success) {
      window.location.assign("/dashboard");
      return;
    }
    setMessage(payload.error ?? "無法接受邀請，請稍後再試");
    setBusy(false);
  }

  if (!isSignedIn) {
    // Come back to this invite after the magic link, instead of the dashboard.
    const loginHref = `/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`;
    return (
      <div className="space-y-3">
        <a href={loginHref} className={BUTTON}>
          登入以接受邀請
        </a>
        <p className="text-center text-sm text-secondary-foreground">
          請使用 {invitedEmail} 登入
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={acceptInvite} disabled={busy} className={BUTTON}>
        {busy ? "處理中…" : "接受邀請"}
      </button>
      {message && <p className="text-center text-sm text-destructive">{message}</p>}
      <p className="text-center text-sm text-secondary-foreground">
        需使用 {invitedEmail} 登入的帳號才能接受
      </p>
    </div>
  );
}
