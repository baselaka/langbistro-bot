/** YYYY-MM-DD in the given IANA timezone */
export function getLocalDateString(timeZone: string, date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

/** Hour (0-23) and minute in the given IANA timezone */
export function getLocalHourMinute(timeZone: string, date: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/** ISO week key for the local calendar date, e.g. `2026-W37`. */
export function isoWeekKey(timeZone: string, date: Date = new Date()): string {
  const localYmd = getLocalDateString(timeZone, date);
  const [y, m, d] = localYmd.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  const day = utcNoon.getUTCDay() || 7;
  utcNoon.setUTCDate(utcNoon.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcNoon.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcNoon.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utcNoon.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Yesterday's YYYY-MM-DD relative to a local calendar date string. */
export function previousLocalDateString(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

/** Inclusive day gap between two YYYY-MM-DD strings (later - earlier). */
export function daysBetweenLocalDates(earlier: string, later: string): number {
  const [y1, m1, d1] = earlier.split("-").map(Number);
  const [y2, m2, d2] = later.split("-").map(Number);
  const a = Date.UTC(y1!, m1! - 1, d1!);
  const b = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((b - a) / 86_400_000);
}
