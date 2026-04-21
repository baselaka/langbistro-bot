import express, { type Request, type Response } from "express";
import { Paddle, type EventEntity as WebhookUnmarshal } from "@paddle/paddle-node-sdk";
import { env } from "./config/env";
import { supabase } from "./db/client";

const paddle = new Paddle(env.PADDLE_API_KEY);

type SubscriptionPayload = {
  id?: string;
  status?: string;
  customerId?: string;
  customData?: Record<string, unknown> | null;
  nextBilledAt?: string | null;
  currentBillingPeriod?: { endsAt?: string | null } | null;
};

function getTelegramIdFromPayload(payload: SubscriptionPayload): number | null {
  const raw =
    payload.customData?.telegram_id ??
    payload.customData?.telegramId ??
    payload.customData?.user_telegram_id ??
    null;
  if (raw === null || raw === undefined) {
    return null;
  }
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

async function findUserId(payload: SubscriptionPayload): Promise<number | null> {
  if (payload.customerId) {
    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_customer_id", payload.customerId)
      .single();
    if (subRow?.user_id) {
      return Number(subRow.user_id);
    }
  }

  const telegramId = getTelegramIdFromPayload(payload);
  if (!telegramId) {
    return null;
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
    .single();

  return userRow?.id ? Number(userRow.id) : null;
}

async function upsertSubscription(
  userId: number,
  payload: SubscriptionPayload,
  status: string
): Promise<void> {
  const currentPeriodEnd = payload.currentBillingPeriod?.endsAt ?? payload.nextBilledAt ?? null;
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      paddle_customer_id: payload.customerId ?? null,
      paddle_subscription_id: payload.id ?? null,
      status,
      current_period_end: currentPeriodEnd,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
}

export function startServer(): void {
  const app = express();
  const port = Number(process.env.PORT ?? 8080);

  app.post(
    "/webhook/paddle",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const signature = req.header("paddle-signature");
      if (!signature) {
        res.status(401).send("Missing signature");
        return;
      }

      const requestBody = req.body.toString("utf8");
      let event: WebhookUnmarshal;

      try {
        event = await paddle.webhooks.unmarshal(requestBody, env.PADDLE_WEBHOOK_SECRET, signature);
      } catch {
        res.status(401).send("Invalid signature");
        return;
      }

      const eventType = (event as { eventType?: string }).eventType ?? "unknown";
      console.log("[Paddle webhook] event:", eventType);

      const payload = (event as { data?: SubscriptionPayload }).data ?? {};
      const userId = await findUserId(payload);

      if (!userId) {
        res.status(200).send("Ignored: user not found");
        return;
      }

      try {
        if (eventType === "subscription.activated") {
          const { error } = await supabase.from("users").update({ is_subscribed: true }).eq("id", userId);
          if (error) {
            throw new Error(`Failed to activate user subscription: ${error.message}`);
          }
          await upsertSubscription(userId, payload, payload.status ?? "active");
        } else if (eventType === "subscription.updated") {
          const nextStatus = payload.status ?? "updated";
          const { error } = await supabase
            .from("users")
            .update({ is_subscribed: nextStatus === "active" })
            .eq("id", userId);
          if (error) {
            throw new Error(`Failed to update user subscription flag: ${error.message}`);
          }
          await upsertSubscription(userId, payload, nextStatus);
        } else if (eventType === "subscription.canceled") {
          await upsertSubscription(userId, payload, "canceled");
          const currentPeriodEnd = payload.currentBillingPeriod?.endsAt ?? payload.nextBilledAt ?? null;
          const shouldRevokeNow = (() => {
            if (!currentPeriodEnd) return true;
            const endMs = Date.parse(currentPeriodEnd);
            return Number.isFinite(endMs) && endMs <= Date.now();
          })();
          if (shouldRevokeNow) {
            const { error } = await supabase.from("users").update({ is_subscribed: false }).eq("id", userId);
            if (error) {
              throw new Error(`Failed to revoke canceled subscription access: ${error.message}`);
            }
          }
        } else if (eventType === "subscription.past_due") {
          const { error: userError } = await supabase.from("users").update({ is_subscribed: false }).eq("id", userId);
          if (userError) {
            throw new Error(`Failed to set past_due subscription access: ${userError.message}`);
          }
          const { error: subError } = await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("user_id", userId);
          if (subError) {
            throw new Error(`Failed to set past_due subscription status: ${subError.message}`);
          }
        }

        res.status(200).send("OK");
      } catch (dbError) {
        console.error("[Paddle webhook] DB write failed:", dbError);
        res.status(500).send("DB write failed");
      }
    }
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).send("OK");
  });

  app.listen(port, () => {
    console.log(`HTTP server listening on port ${port}`);
  });
}
