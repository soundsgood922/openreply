import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isPlatformAdmin } from "@/lib/env";
import { PlatformTag } from "@/components/account-select";

export const dynamic = "force-dynamic";

const ROLE_NAME = { OWNER: "擁有者", ADMIN: "管理員", MEMBER: "成員" } as const;

/**
 * Every brand on this deployment at a glance: its connected Page and
 * Instagram account, who can sign in to it, and pending invitations. Only for
 * PLATFORM_ADMIN_EMAILS; anyone else gets a 404. Read-only: brands and
 * accounts are added by script, members from each brand's own settings.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id || !isPlatformAdmin(session.user.email)) notFound();

  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      instagramAccounts: {
        orderBy: { connectedAt: "asc" },
        select: {
          id: true,
          username: true,
          provider: true,
          tokenExpiresAt: true,
          webhookSubscribed: true,
        },
      },
      members: {
        orderBy: { createdAt: "asc" },
        select: { role: true, userId: true, user: { select: { email: true } } },
      },
      invitations: {
        where: { status: "PENDING" },
        select: { email: true, role: true, expiresAt: true },
      },
      _count: { select: { automations: { where: { isActive: true } } } },
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <p className="text-sm text-muted">
        共 {workspaces.length} 個品牌。新增品牌或帳號請由管理者用腳本建立；成員在各品牌的「設定 → 團隊」邀請或移除。
      </p>

      {workspaces.map((ws) => {
        const isMember = ws.members.some((m) => m.userId === session.user!.id);
        return (
          <section key={ws.id} className="panel rounded p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{ws.name}</h2>
                <p className="text-xs text-muted mt-0.5">
                  啟用中活動 {ws._count.automations} 個 · 本月私訊 {ws.dmsSentThisPeriod} 則
                </p>
              </div>
              {isMember ? (
                <form method="post" action="/api/workspace/select">
                  <input type="hidden" name="workspaceId" value={ws.id} />
                  <button
                    type="submit"
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    進入此品牌
                  </button>
                </form>
              ) : (
                <span className="text-xs text-muted">你不是此品牌成員</span>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">已連接帳號</h3>
              {ws.instagramAccounts.length === 0 ? (
                <p className="text-sm text-muted">尚未連接</p>
              ) : (
                <ul className="space-y-2">
                  {ws.instagramAccounts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <PlatformTag account={a} />
                      <span className="text-foreground">
                        {a.provider === "FACEBOOK" ? a.username : `@${a.username}`}
                      </span>
                      <span className="text-xs text-muted">
                        {a.tokenExpiresAt
                          ? `權杖到期 ${a.tokenExpiresAt.toLocaleDateString("zh-TW")}`
                          : "粉專權杖（不會過期）"}
                        {" · "}
                        {a.webhookSubscribed ? "Webhook 已就緒" : "Webhook 尚未就緒"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">可登入的人</h3>
              <ul className="space-y-1.5">
                {ws.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground truncate">{m.user.email ?? "（無信箱）"}</span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      {ROLE_NAME[m.role]}
                    </span>
                  </li>
                ))}
                {ws.invitations.map((inv) => (
                  <li key={inv.email} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted truncate">{inv.email}</span>
                    <span className="shrink-0 text-xs text-muted">
                      邀請中（{ROLE_NAME[inv.role]}，{inv.expiresAt.toLocaleDateString("zh-TW")} 到期）
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
