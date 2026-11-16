import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { sendMessage } from "@/lib/telegram/api";
import { requireUserId } from "@/lib/user";


export async function POST() {
  try {
    const userId = await requireUserId();
    const conn = await prisma.telegramConnection.findUnique({ where: { userId } });
    if (conn) {
      await prisma.telegramConnection.delete({ where: { userId } });
      await sendMessage(conn.chatId, "👋 Вэб апп-аас Telegram холболтыг салгалаа. Мэдэгдэл илгээхээ зогсоолоо.").catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
