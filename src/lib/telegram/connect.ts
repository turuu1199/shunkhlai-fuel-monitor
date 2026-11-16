import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Creates a single-use deep-link token. Only its SHA-256 hash is stored. */
export async function createConnectionToken(userId: string) {
  const token = randomBytes(32).toString("base64url"); // 43 chars, allowed by Telegram start param ([A-Za-z0-9_-], ≤64)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.$transaction([
    // Invalidate previous unused tokens for this user.
    prisma.telegramConnectionToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.telegramConnectionToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt } }),
  ]);
  return { url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`, expiresAt };
}

export type ConsumeResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

/** Atomically claims the token and binds the Telegram chat id to the token owner. */
export async function consumeConnectionToken(
  token: string,
  chat: { chatId: bigint; username: string | null; firstName: string | null },
): Promise<ConsumeResult> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, reason: "invalid" };
  const tokenHash = hashToken(token);

  return prisma.$transaction(async (tx) => {
    const row = await tx.telegramConnectionToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt) return { ok: false, reason: "invalid" } as const;
    if (row.expiresAt < new Date()) return { ok: false, reason: "expired" } as const;

    // Conditional update = race-safe single use.
    const claimed = await tx.telegramConnectionToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return { ok: false, reason: "invalid" } as const;

    // A chat can belong to only one web user and vice versa.
    await tx.telegramConnection.deleteMany({ where: { OR: [{ chatId: chat.chatId }, { userId: row.userId }] } });
    await tx.telegramConnection.create({
      data: { userId: row.userId, chatId: chat.chatId, telegramUsername: chat.username, firstName: chat.firstName },
    });
    await tx.userPreference.upsert({ where: { userId: row.userId }, create: { userId: row.userId }, update: {} });
    return { ok: true, userId: row.userId } as const;
  });
}
