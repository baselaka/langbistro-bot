import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

function parseAdminTelegramIds(raw: string | undefined): number[] {
  if (!raw || raw.trim() === "") {
    return [];
  }
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const id = Number(trimmed);
    if (!Number.isFinite(id)) {
      throw new Error(`ADMIN_TELEGRAM_IDS contains invalid id: ${trimmed}`);
    }
    ids.push(id);
  }
  return ids;
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(1, "TELEGRAM_BOT_TOKEN is required and cannot be empty"),
  OPENAI_API_KEY: z
    .string()
    .min(1, "OPENAI_API_KEY is required and cannot be empty"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, "SUPABASE_ANON_KEY is required and cannot be empty"),
  PADDLE_API_KEY: z
    .string()
    .min(1, "PADDLE_API_KEY is required and cannot be empty"),
  PADDLE_WEBHOOK_SECRET: z
    .string()
    .min(1, "PADDLE_WEBHOOK_SECRET is required and cannot be empty"),
  PADDLE_MONTHLY_PRICE_ID: z
    .string()
    .min(1, "PADDLE_MONTHLY_PRICE_ID is required and cannot be empty"),
  PADDLE_YEARLY_PRICE_ID: z
    .string()
    .min(1, "PADDLE_YEARLY_PRICE_ID is required and cannot be empty"),
  ADMIN_TELEGRAM_IDS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `- ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  adminTelegramIds: parseAdminTelegramIds(parsed.data.ADMIN_TELEGRAM_IDS),
};
