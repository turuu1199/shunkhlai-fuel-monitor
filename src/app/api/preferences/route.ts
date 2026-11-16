import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { getMe, preferenceInput } from "@/lib/me";
import { rateLimit } from "@/lib/rate-limit";
import { ensureUser, HttpError, requireUserId } from "@/lib/user";


export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    if (!(await rateLimit(`prefs:${userId}`, 60, 60))) throw new HttpError(429, "Too many requests");
    const input = preferenceInput.parse(await req.json());
    await ensureUser(userId);
    await prisma.userPreference.update({ where: { userId }, data: input });
    return NextResponse.json(await getMe(userId));
  } catch (e) {
    return handleRouteError(e);
  }
}
