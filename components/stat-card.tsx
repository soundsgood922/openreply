"use client";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Stat Card
 *
 * Metric card with label, value, and optional trend.
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
    <div className="panel p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {trend && (
        <p className={`mt-1 text-xs ${trendUp ? "text-success" : "text-error"}`}>
          {trendUp ? t("Up") : t("Down")} {trend}
        </p>
      )}
    </div>
  );
}
