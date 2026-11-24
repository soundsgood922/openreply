"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Status pill for a DM log: the colour carries the state.
 */

const statusConfig: Record<string, { tone: string; label: StaticMessageKey }> = {
  SENT: { tone: "bg-success/10 text-success", label: "Sent" },
  FAILED: { tone: "bg-error/10 text-error", label: "Failed" },
  PENDING: { tone: "bg-warning/10 text-warning", label: "Pending" },
  SKIPPED_DEDUP: { tone: "bg-muted text-muted-foreground", label: "Dedup" },
  SKIPPED_RATE_LIMIT: { tone: "bg-warning/10 text-warning", label: "Rate limited" },
  SKIPPED_PLAN_LIMIT: { tone: "bg-warning/10 text-warning", label: "Skipped" },
  SKIPPED_NO_MATCH: { tone: "bg-muted text-muted-foreground", label: "No match" },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();
  const config = statusConfig[status] ?? statusConfig.PENDING;

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${config.tone}`}
    >
      {t(config.label)}
    </span>
  );
}
