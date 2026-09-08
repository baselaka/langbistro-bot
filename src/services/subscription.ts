import { supabase } from "../db/client";

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

export async function loadEntitlementRow(userId: number): Promise<SubscriptionEntitlementRow | null> {
  const { data: activeRow, error: activeError } = await supabase
    .from("subscriptions")
    .select("source, status, current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (activeError) {
    throw new Error(`Failed to read active subscription for user: ${activeError.message}`);
  }

  if (activeRow) {
    return activeRow as SubscriptionEntitlementRow;
  }

  const nowIso = new Date().toISOString();
  const { data: graceRows, error: graceError } = await supabase
    .from("subscriptions")
    .select("source, status, current_period_end")
    .eq("user_id", userId)
    .eq("status", "canceled")
    .eq("source", "paddle")
    .gt("current_period_end", nowIso)
    .limit(1);

  if (graceError) {
    throw new Error(`Failed to read canceled subscription grace for user: ${graceError.message}`);
  }

  const grace = graceRows?.[0];
  return grace ? (grace as SubscriptionEntitlementRow) : null;
}

export async function supersedeActiveSubscriptions(
  userId: number,
  exceptId?: number
): Promise<void> {
  let query = supabase
    .from("subscriptions")
    .update({ status: "replaced" })
    .eq("user_id", userId)
    .eq("status", "active");

  if (exceptId !== undefined) {
    query = query.neq("id", exceptId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Failed to supersede active subscriptions: ${error.message}`);
  }
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

export async function grantCompSubscription(input: {
  userId: number;
  duration: GrantDuration;
  grantedBy: string;
  note?: string;
}): Promise<{ currentPeriodEnd: string | null }> {
  await supersedeActiveSubscriptions(input.userId);

  const currentPeriodEnd = periodEndFromGrantDuration(input.duration);
  const { error: insertError } = await supabase.from("subscriptions").insert({
    user_id: input.userId,
    status: "active",
    source: "comp",
    current_period_end: currentPeriodEnd,
    granted_by: input.grantedBy,
    note: input.note ?? "admin /grant",
  });

  if (insertError) {
    throw new Error(`Failed to insert comp subscription: ${insertError.message}`);
  }

  const { error: userError } = await supabase
    .from("users")
    .update({ is_subscribed: true })
    .eq("id", input.userId);

  if (userError) {
    throw new Error(`Failed to set is_subscribed after grant: ${userError.message}`);
  }

  return { currentPeriodEnd };
}

export async function upsertPaddleSubscription(
  userId: number,
  fields: {
    paddleCustomerId: string | null;
    paddleSubscriptionId: string | null;
    status: string;
    currentPeriodEnd: string | null;
  }
): Promise<void> {
  let existingId: number | null = null;

  if (fields.paddleSubscriptionId) {
    const { data: bySubId, error: bySubError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("paddle_subscription_id", fields.paddleSubscriptionId)
      .maybeSingle();
    if (bySubError) {
      throw new Error(`Failed to look up paddle subscription: ${bySubError.message}`);
    }
    if (bySubId?.id) {
      existingId = Number(bySubId.id);
    }
  }

  if (existingId === null) {
    const { data: byUser, error: byUserError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "paddle")
      .order("id", { ascending: false })
      .limit(1);
    if (byUserError) {
      throw new Error(`Failed to look up paddle subscription by user: ${byUserError.message}`);
    }
    if (byUser?.[0]?.id) {
      existingId = Number(byUser[0].id);
    }
  }

  if (fields.status === "active") {
    await supersedeActiveSubscriptions(userId, existingId ?? undefined);
  }

  const row = {
    user_id: userId,
    paddle_customer_id: fields.paddleCustomerId,
    paddle_subscription_id: fields.paddleSubscriptionId,
    status: fields.status,
    current_period_end: fields.currentPeriodEnd,
    source: "paddle" as const,
  };

  if (existingId !== null) {
    const { error } = await supabase.from("subscriptions").update(row).eq("id", existingId);
    if (error) {
      throw new Error(`Failed to update paddle subscription: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("subscriptions").insert(row);
  if (error) {
    throw new Error(`Failed to insert paddle subscription: ${error.message}`);
  }
}
