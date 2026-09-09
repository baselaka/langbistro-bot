import { env } from "../config/env";

export function isAdmin(telegramId: number): boolean {
  return env.adminTelegramIds.includes(telegramId);
}

export function parseTelegramTarget(
  raw: string
): { kind: "username"; username: string } | { kind: "telegramId"; telegramId: number } | null {
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
