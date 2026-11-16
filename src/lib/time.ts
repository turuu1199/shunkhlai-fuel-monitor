export const UB_TZ = "Asia/Ulaanbaatar";

/** YYYY-MM-DD in Ulaanbaatar time. */
export function ubDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: UB_TZ }).format(d);
}

export function ubTime(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("mn-MN", { timeZone: UB_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
