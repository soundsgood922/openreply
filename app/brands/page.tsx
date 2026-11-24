import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { listMemberships, readActiveWorkspaceCookie } from "@/lib/workspace";

export const metadata: Metadata = { title: "選擇品牌" };

export default async function BrandsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/brands");

  const memberships = await listMemberships(session.user.id);
  if (memberships.length === 0) redirect("/dashboard");

  const active = await readActiveWorkspaceCookie();
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: { in: memberships.map((m) => m.workspaceId) } },
    select: { workspaceId: true, username: true, provider: true },
    orderBy: { connectedAt: "asc" },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-background">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-foreground text-center">選擇品牌</h1>
        <p className="mt-2 text-sm text-muted text-center">要進入哪個品牌的後台？</p>
        <div className="mt-8 space-y-3">
          {memberships.map((m) => {
            const own = accounts.filter((a) => a.workspaceId === m.workspaceId);
            return (
              <form key={m.workspaceId} method="post" action="/api/workspace/select">
                <input type="hidden" name="workspaceId" value={m.workspaceId} />
                <button
                  type="submit"
                  className={`panel w-full rounded p-4 text-left transition-colors hover:border-accent/50 ${
                    m.workspaceId === active ? "border-accent/60" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-base font-semibold text-foreground">{m.workspace.name}</span>
                    {m.workspaceId === active && (
                      <span className="text-xs text-accent">目前所在</span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {own.length === 0
                      ? "尚未連接帳號"
                      : own
                          .map((a) =>
                            a.provider === "FACEBOOK"
                              ? `FB 粉專 · ${a.username}`
                              : `IG @${a.username}`
                          )
                          .join("　")}
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}
