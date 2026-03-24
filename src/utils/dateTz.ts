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
