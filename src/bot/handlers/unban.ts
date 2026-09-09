import type { Context } from "grammy";
import { supabase } from "../../db/client";
import { isAdmin, parseTelegramTarget } from "../admin";

/**
 * Admin-only: `/unban @user` or `/unban <telegram_id>`
 * Clears is_banned and resets violation_count to 0.
 * Not listed in the public command menu.
 */
export async function handleUnban(ctx: Context): Promise<void> {
  const fromId = ctx.from?.id;
  if (!fromId || !isAdmin(fromId)) {
    return;
  }

  const text = ctx.message?.text ?? "";
  const parts = text.trim().split(/\s+/).slice(1);
  if (parts.length < 1) {
    await ctx.reply("Usage: /unban @username|telegram_id");
    return;
  }

  const target = parseTelegramTarget(parts[0] ?? "");
  if (!target) {
    await ctx.reply("Usage: /unban @username|telegram_id");
    return;
  }

  let userQuery = supabase.from("users").select("id, telegram_id, username, is_banned, violation_count");
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

  const { error: updateError } = await supabase
    .from("users")
    .update({ is_banned: false, violation_count: 0 })
    .eq("id", user.id);

  if (updateError) {
    await ctx.reply(`Unban failed: ${updateError.message}`);
    return;
  }

  const label = user.username ? `@${user.username}` : String(user.telegram_id);
  await ctx.reply(
    `Unbanned ${label} (was banned=${user.is_banned}, violation_count=${user.violation_count ?? 0}).`
  );
}
