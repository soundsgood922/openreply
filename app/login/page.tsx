import { EMAIL_PROVIDER_ID, signIn } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";
import { DemoNotice } from "@/components/demo-notice";
import { isPublicDemoHost } from "@/lib/env";

const GITHUB_URL = "https://github.com/diwenne/openreply";
const SETUP_DOCS_URL = `${GITHUB_URL}/blob/main/docs/setup.md`;

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Login - OpenReply"),
    description: t("Sign in to manage Instagram comment-to-DM campaigns."),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkEmail?: string;
    callbackUrl?: string;
    template?: string;
  }>;
}) {
  const { t } = await getI18n();
  if (await isPublicDemoHost()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            OpenReply
          </h1>
          <div className="panel rounded p-8 mt-8 shadow-black/40">
            <h2 className="text-lg font-semibold text-foreground">
              {t("Sign-in is off on this demo")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("This is the public demo — it doesn’t create real accounts or send DMs. To use OpenReply for real, clone it and run your own instance with your own Meta app and domain.")}
            </p>
            <a
              href={SETUP_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-indigo-500/25 transition-all hover:shadow-indigo-500/30"
            >
              {t("Clone it yourself")} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const checkEmail = params.checkEmail === "1";
  const selectedTemplate = getCampaignTemplate(params.template);
  const templateCallbackUrl = selectedTemplate
    ? `/campaigns/new?template=${selectedTemplate.slug}`
    : null;
  const callbackUrl = params.callbackUrl ?? templateCallbackUrl ?? "/dashboard";

  async function sendMagicLink(formData: FormData) {
    "use server";
    await signIn(EMAIL_PROVIDER_ID, {
      email: String(formData.get("email") ?? ""),
      redirectTo: callbackUrl,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[593px]">
        <h1 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground">登入</h1>

        <DemoNotice variant="panel" />

        <div className="rounded-2xl bg-card px-8 py-7">
          {checkEmail ? (
            <div className="py-4 text-center">
              <h2 className="mb-2 text-xl font-bold text-foreground">請到信箱收信</h2>
              <p className="text-sm text-secondary-foreground">
                登入連結已寄出，請在這台裝置上打開信中的連結完成登入。初次登入時，信件可能被寄到垃圾信件匣。
              </p>
            </div>
          ) : (
            <form action={sendMagicLink}>
              <label htmlFor="email" className="block text-xl font-bold text-foreground">
                電子信箱帳號
              </label>
              <p className="mt-1 text-sm text-secondary-foreground">初次登入，信件可能被寄到垃圾信件匣</p>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@mail.com"
                className="mt-4 h-14 w-full rounded-xl bg-secondary px-4 text-base text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none"
              />
              <button
                type="submit"
                className="mt-14 h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                寄送登入連結
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
