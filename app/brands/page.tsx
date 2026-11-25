import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { listMemberships, readActiveWorkspaceCookie } from "@/lib/workspace";
import { FacebookIcon, InstagramIcon } from "@/components/brand-icons";

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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-[593px]">
        <h1 className="text-center text-3xl font-bold tracking-tight text-foreground">選擇品牌</h1>
        <p className="mt-3 text-center text-base text-secondary-foreground">要進入哪個品牌的後台？</p>
        <div className="mt-12 space-y-10">
          {memberships.map((m) => {
            // Instagram first, then the Facebook Page, as in the design.
            const own = accounts
              .filter((a) => a.workspaceId === m.workspaceId)
              .sort((a, b) => Number(a.provider === "FACEBOOK") - Number(b.provider === "FACEBOOK"));
            const current = m.workspaceId === active;
            return (
              <form key={m.workspaceId} method="post" action="/api/workspace/select">
                <input type="hidden" name="workspaceId" value={m.workspaceId} />
                <button
                  type="submit"
                  className={`w-full rounded-2xl bg-card px-8 py-6 text-left ring-primary/40 transition hover:ring-2 ${
                    current ? "ring-2" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xl font-bold text-foreground">{m.workspace.name}</span>
                    {current && (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">目前所在品牌</span>
                    )}
                  </span>
                  <span className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-base text-muted-foreground">
                    {own.length === 0
                      ? "尚未連接帳號"
                      : own.map((a) => (
                          <span key={`${a.provider}-${a.username}`} className="inline-flex items-center gap-2.5">
                            {a.provider === "FACEBOOK" ? (
                              <FacebookIcon className="size-5" />
                            ) : (
                              <InstagramIcon className="size-5" />
                            )}
                            {a.provider === "FACEBOOK" ? a.username : `@${a.username}`}
                          </span>
                        ))}
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
