import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/http";
import { tgCall } from "@/lib/telegram/api";
import { BOT_COMMANDS } from "@/lib/telegram/bot";


/** One-off: registers the webhook + command menu. `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP/api/telegram/setup` */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req, env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!env.TELEGRAM_WEBHOOK_SECRET) return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET not set" }, { status: 500 });
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/telegram/webhook`;
  await tgCall("setWebhook", {
    url,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await tgCall("setMyCommands", { commands: BOT_COMMANDS });
  const info = await tgCall("getWebhookInfo", {});
  return NextResponse.json({ ok: true, webhook: info });
}
