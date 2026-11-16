type Level = "info" | "warn" | "error";

/** Structured JSON logs — readable in Vercel log drains. */
export function log(level: Level, msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...data, t: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
