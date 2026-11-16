import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ensureUser, HttpError, requireUserId } from "@/lib/user";


const input = z.object({ stationId: z.string().uuid(), favorite: z.boolean() });

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (!(await rateLimit(`fav:${userId}`, 60, 60))) throw new HttpError(429, "Too many requests");
    const { stationId, favorite } = input.parse(await req.json());
    await ensureUser(userId);
    if (favorite) {
      const exists = await prisma.fuelStation.findUnique({ where: { id: stationId }, select: { id: true } });
      if (!exists) throw new HttpError(404, "Station not found");
      await prisma.favoriteStation.upsert({ where: { userId_stationId: { userId, stationId } }, create: { userId, stationId }, update: {} });
    } else {
      await prisma.favoriteStation.deleteMany({ where: { userId, stationId } });
    }
    const favorites = await prisma.favoriteStation.findMany({ where: { userId }, select: { stationId: true } });
    return NextResponse.json({ favorites: favorites.map((f) => f.stationId) });
  } catch (e) {
    return handleRouteError(e);
  }
}
