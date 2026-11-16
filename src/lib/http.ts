import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/user";
import { errMsg, log } from "@/lib/log";

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Bearer-token check for machine endpoints (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export function isAuthorizedCron(req: Request, secret: string): boolean {
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${secret}`);
}

export function handleRouteError(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
  log("error", "route error", { error: errMsg(e) });
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
