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
  /** Server-only. Bypasses RLS — never ship to browsers or client code. */
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required and cannot be empty"),
  /** Deprecated: optional for Railway rollback only. Prefer SUPABASE_SERVICE_ROLE_KEY. */
  SUPABASE_ANON_KEY: z.string().optional(),
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
  WINBACK_SUPPRESS_ENABLED: z.string().optional(),
});

/** undefined/empty → true; false/0/no/off → false; otherwise true. */
export function parseWinbackSuppressEnabled(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return true;
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `- ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  adminTelegramIds: parseAdminTelegramIds(parsed.data.ADMIN_TELEGRAM_IDS),
  winbackSuppressEnabled: parseWinbackSuppressEnabled(parsed.data.WINBACK_SUPPRESS_ENABLED),
};
