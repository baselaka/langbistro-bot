import { supabase } from "../db/client";
import {
  periodEndFromGrantDuration,
  type GrantDuration,
  type SubscriptionEntitlementRow,
} from "./subscriptionRules";

export type {
  GrantDuration,
  SubscriptionEntitlementRow,
  SubscriptionSource,
} from "./subscriptionRules";
export {
  parseGrantDuration,
  periodEndFromGrantDuration,
  shouldRevokeEntitlement,
} from "./subscriptionRules";

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
