import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleRouteError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createConnectionToken } from "@/lib/telegram/connect";
import { ensureUser, HttpError, requireUserId } from "@/lib/user";


export async function POST() {
  try {
    const userId = await requireUserId();
    if (!env.TELEGRAM_BOT_USERNAME || !env.TELEGRAM_BOT_TOKEN) throw new HttpError(503, "Telegram bot is not configured");
    if (!(await rateLimit(`connect:${userId}`, 5, 600))) throw new HttpError(429, "Too many requests");
    await ensureUser(userId);
    const { url, expiresAt } = await createConnectionToken(userId);
    return NextResponse.json({ url, expiresAt });
  } catch (e) {
    return handleRouteError(e);
  }
}
