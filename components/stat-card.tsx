"use client";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Stat Card (per the design): outlined card, label above a large number.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({ label, value, trend, trendUp }: StatCardProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-5">
      <p className="text-[15px] text-secondary-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      {trend && (
        <p className={`mt-1 text-xs ${trendUp ? "text-success" : "text-error"}`}>
          {trendUp ? t("Up") : t("Down")} {trend}
        </p>
      )}
    </div>
  );
}
