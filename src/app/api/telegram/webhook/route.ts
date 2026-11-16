import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/http";
import { log } from "@/lib/log";
import { handleUpdate, updateSchema } from "@/lib/telegram/bot";

export const maxDuration = 30;

export async function POST(req: Request) {
  // Telegram echoes the secret passed to setWebhook in this header.
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    log("warn", "telegram update ignored (unsupported shape)");
    return NextResponse.json({ ok: true }); // 200 so Telegram doesn't retry
  }
  await handleUpdate(parsed.data);
  return NextResponse.json({ ok: true });
}
