export function etToUtc(localHHMM: string): string {
  // Parse HH:MM
  const [hours, minutes] = localHHMM.split(":").map(Number);
  // Use today's date to get the correct DST offset for America/New_York
  const now = new Date();
  const testDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    0
  ));
  // Get the UTC offset for America/New_York at this moment
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(testDate);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = offsetPart.match(/GMT([+-]\d+)/);
  const offsetHours = match ? parseInt(match[1], 10) : -5;
  // Convert: UTC = local - offset
  const utcHours = ((hours - offsetHours) + 24) % 24;
  return `${String(utcHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
