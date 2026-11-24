"use client";



export interface AccountOption {
  id: string;
  username: string;
  instagramId: string;
  name?: string | null;
  provider?: "META" | "ZERNIO" | "FACEBOOK";
}

/** "@handle" for Instagram; a Facebook Page is labelled as one. */
export function accountLabel(account: Pick<AccountOption, "username" | "provider">) {
  return account.provider === "FACEBOOK"
    ? `FB 粉專 · ${account.username}`
    : `@${account.username}`;
}

type Platform = "FACEBOOK" | "INSTAGRAM";

function platformOf(account: Pick<AccountOption, "provider">): Platform {
  return account.provider === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM";
}

const PLATFORM_NAME: Record<Platform, string> = {
  FACEBOOK: "Facebook 粉絲專頁",
  INSTAGRAM: "Instagram 帳號",
};

/**
 * The platform as the option text. A brand holds one Page and one Instagram
 * account, so the platform alone identifies the account; the name is added
 * only when two accounts share a platform.
 */
function optionLabel(account: AccountOption, accounts: AccountOption[]) {
  const platform = platformOf(account);
  const shared = accounts.filter((a) => platformOf(a) === platform).length > 1;
  return shared ? `${PLATFORM_NAME[platform]} · ${account.username}` : PLATFORM_NAME[platform];
}

/** Coloured platform tag: blue for a Facebook Page, pink-purple for Instagram. */
export function PlatformTag({
  account,
}: {
  account: Pick<AccountOption, "provider" | "username">;
}) {
  const facebook = platformOf(account) === "FACEBOOK";
  return (
    <span
      title={accountLabel(account)}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
        facebook
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-300"
          : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-300"
      }`}
    >
      {facebook ? "Facebook 粉絲專頁" : "Instagram"}
    </span>
  );
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
}

export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label,
}: AccountSelectProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label ?? "切換帳號平台"}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-52 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
      >
        {includeAll && <option value="all">全部</option>}
        {[...accounts]
          // Facebook Page first, then Instagram, as the platform menu reads.
          .sort((a, b) => Number(platformOf(b) === "FACEBOOK") - Number(platformOf(a) === "FACEBOOK"))
          .map((account) => (
          <option key={account.id} value={account.id}>
            {optionLabel(account, accounts)}
          </option>
        ))}
      </select>
    </label>
  );
}

