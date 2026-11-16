import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_HEADER } from "@/lib/session-token";

/** Verified anonymous user id set by proxy.ts (null if no valid session). */
export async function getUserId(): Promise<string | null> {
  return (await headers()).get(USER_HEADER);
}

/** Ensures User + default preferences exist (lazy creation on first real use). */
export async function ensureUser(userId: string) {
  await prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  return prisma.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new HttpError(401, "No session");
  return id;
}
