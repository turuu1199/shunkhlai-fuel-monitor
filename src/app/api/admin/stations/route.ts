import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { log } from "@/lib/log";

const input = z
  .object({
    id: z.string().uuid(),
    latitude: z.number().min(41).max(53).nullable(), // Mongolia bounding box
    longitude: z.number().min(87).max(120).nullable(),
    verified: z.boolean(),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), "latitude and longitude must be set together");

/** Admin: set / clear a station's coordinates. Saved with source "admin" so syncs never overwrite them. */
export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const { id, latitude, longitude, verified } = input.parse(await req.json());
    const cleared = latitude === null;
    const s = await prisma.fuelStation.update({
      where: { id },
      data: {
        latitude,
        longitude,
        coordinateVerified: cleared ? false : verified,
        // Clearing returns control to the JSON dataset (null source); otherwise lock as admin-managed.
        coordinateSource: cleared ? null : "admin",
      },
      select: { id: true, latitude: true, longitude: true, coordinateVerified: true, coordinateSource: true },
    });
    log("info", "admin updated station coordinates", { id, latitude, longitude, verified: s.coordinateVerified });
    return NextResponse.json(s);
  } catch (e) {
    return handleRouteError(e);
  }
}
