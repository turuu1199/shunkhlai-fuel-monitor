import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/http";
import { runMonitor } from "@/lib/monitor";

export const maxDuration = 60;

/** Triggered by Vercel Cron (GET) or an external scheduler (GET/POST) with `Authorization: Bearer $CRON_SECRET`. */
async function handler(req: Request) {
  if (!isAuthorizedCron(req, env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await runMonitor({ force });
  return NextResponse.json(result, { status: !result.skipped && !result.ok ? 502 : 200 });
}

export { handler as GET, handler as POST };
