import type { Context } from "grammy";
import { env } from "../../config/env";
import { supabase } from "../../db/client";
import { grantCompSubscription, parseGrantDuration } from "../../services/subscription";

function isAdmin(telegramId: number): boolean {
  return env.adminTelegramIds.includes(telegramId);
}

function parseTarget(raw: string): { kind: "username"; username: string } | { kind: "telegramId"; telegramId: number } | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return { kind: "telegramId", telegramId: Number(value) };
  }
  const username = value.startsWith("@") ? value.slice(1) : value;
  if (!username) {
    return null;
  }
  return { kind: "username", username };
}

/**
 * Admin-only: `/grant @user 30d` or `/grant @user forever` [optional note…]
 * Also accepts a numeric telegram id instead of @username.
 * Not listed in the public command menu.
 */
export async function handleGrant(ctx: Context): Promise<void> {
  const fromId = ctx.from?.id;
  if (!fromId || !isAdmin(fromId)) {
    return;
  }

  const text = ctx.message?.text ?? "";
  const parts = text.trim().split(/\s+/).slice(1);
  if (parts.length < 2) {
    await ctx.reply("Usage: /grant @username 30d|forever [note]");
    return;
  }

  const target = parseTarget(parts[0] ?? "");
  const duration = parseGrantDuration(parts[1] ?? "");
  if (!target || !duration) {
    await ctx.reply("Usage: /grant @username 30d|forever [note]");
    return;
  }

  const note = parts.slice(2).join(" ").trim() || undefined;

  let userQuery = supabase.from("users").select("id, telegram_id, username");
  if (target.kind === "telegramId") {
    userQuery = userQuery.eq("telegram_id", target.telegramId);
  } else {
    userQuery = userQuery.ilike("username", target.username);
  }

  const { data: user, error: userError } = await userQuery.maybeSingle();
  if (userError) {
    await ctx.reply(`Lookup failed: ${userError.message}`);
    return;
  }
  if (!user) {
    await ctx.reply("User not found.");
    return;
  }

  try {
    const { currentPeriodEnd } = await grantCompSubscription({
      userId: Number(user.id),
      duration,
      grantedBy: String(fromId),
      note,
    });
    const endLabel = currentPeriodEnd ?? "forever";
    await ctx.reply(
      `Granted comp Pro to ${user.username ? `@${user.username}` : user.telegram_id} until ${endLabel}.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await ctx.reply(`Grant failed: ${message}`);
  }
}
