export type SubscriptionSource = "paddle" | "comp" | "trial";

export type SubscriptionEntitlementRow = {
  source: SubscriptionSource;
  status: string;
  current_period_end: string | null;
};

/**
 * Pure entitlement rule for lazy expiry.
 * NULL current_period_end: comp/trial → keep forever; otherwise no entitlement → revoke.
 */
export function shouldRevokeEntitlement(
  row: SubscriptionEntitlementRow | null,
  nowMs: number = Date.now()
): boolean {
  if (!row) {
    return true;
  }

  const periodEndMs = row.current_period_end ? Date.parse(row.current_period_end) : Number.NaN;
  const hasFiniteEnd = Number.isFinite(periodEndMs);
  const isPastEnd = hasFiniteEnd && periodEndMs < nowMs;
  const isFutureEnd = hasFiniteEnd && periodEndMs >= nowMs;

  if (row.status === "active") {
    if (row.source === "comp" || row.source === "trial") {
      if (!row.current_period_end) {
        return false;
      }
      return isPastEnd;
    }
    // Active paddle: billing webhook owns lifecycle.
    return false;
  }

  // Mid-period cancel grace: canceled paddle with a future period end keeps Pro.
  if (row.status === "canceled" && row.source === "paddle" && isFutureEnd) {
    return false;
  }

  return true;
}

export type GrantDuration = { kind: "days"; days: number } | { kind: "forever" };

/** Parse `30d` / `forever` (case-insensitive). Returns null if invalid. */
export function parseGrantDuration(raw: string): GrantDuration | null {
  const value = raw.trim().toLowerCase();
  if (value === "forever") {
    return { kind: "forever" };
  }
  const match = /^(\d+)d$/.exec(value);
  if (!match) {
    return null;
  }
  const days = Number(match[1]);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  return { kind: "days", days };
}

export function periodEndFromGrantDuration(
  duration: GrantDuration,
  now: Date = new Date()
): string | null {
  if (duration.kind === "forever") {
    return null;
  }
  const end = new Date(now.getTime());
  end.setUTCDate(end.getUTCDate() + duration.days);
  return end.toISOString();
}
