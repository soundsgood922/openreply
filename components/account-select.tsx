"use client";

import { ChevronDown } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/brand-icons";



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

/** Platform chip from the designs: outlined, Facebook blue / Instagram pink. */
export function PlatformTag({
  account,
  muted = false,
}: {
  account: Pick<AccountOption, "provider" | "username">;
  // Grey instead of the platform colour, e.g. for a paused campaign.
  muted?: boolean;
}) {
  const facebook = platformOf(account) === "FACEBOOK";
  const tone = muted
    ? "border-border text-muted-foreground"
    : facebook
      ? "border-facebook/40 text-facebook"
      : "border-instagram/40 text-instagram";
  return (
    <span
      title={accountLabel(account)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-sm font-medium ${tone}`}
    >
      {facebook ? <FacebookIcon /> : <InstagramIcon />}
      {facebook ? "Facebook" : "Instagram"}
    </span>
  );
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
  // Label beside the menu (page headers) or above it (forms). Defaults to
  // beside when the menu offers "all", i.e. when it is a page filter.
  layout?: "inline" | "stacked";
}

export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label,
  layout = includeAll ? "inline" : "stacked",
}: AccountSelectProps) {
  const inline = layout === "inline";
  return (
    <label
      className={`flex w-full text-sm sm:w-auto ${
        inline ? "items-center gap-3" : "flex-col gap-1.5"
      }`}
    >
      <span className={`shrink-0 ${inline ? "text-sm text-secondary-foreground" : "text-xs font-medium text-muted-foreground"}`}>
        {label ?? "切換帳號平台"}
      </span>
      <span className="relative w-full sm:w-auto">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-4 pr-10 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20 sm:min-w-64"
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
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-secondary-foreground" />
      </span>
    </label>
  );
}

