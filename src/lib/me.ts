import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ALL_DISTRICTS, DISTRICT_CODES } from "@/lib/districts";

export const preferenceInput = z
  .object({
    latitude: z.number().min(41).max(53).nullable(), // Mongolia bounding box (rough)
    longitude: z.number().min(87).max(120).nullable(),
    district: z.enum([...DISTRICT_CODES, ALL_DISTRICTS]),
    notificationRadiusKm: z.number().min(0.5).max(50),
    telegramNotificationsEnabled: z.boolean(),
    notifyOnAvailable: z.boolean(),
    notifyOnArrivalTime: z.boolean(),
    favoritesOnly: z.boolean(),
    language: z.enum(["mn", "en"]),
  })
  .partial()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), "latitude and longitude must be set together");

export type Preference = {
  latitude: number | null;
  longitude: number | null;
  district: string;
  notificationRadiusKm: number;
  telegramNotificationsEnabled: boolean;
  notifyOnAvailable: boolean;
  notifyOnArrivalTime: boolean;
  favoritesOnly: boolean;
  language: "mn" | "en";
};

export type Me = {
  preference: Preference;
  telegram: { username: string | null; firstName: string | null; connectedAt: string } | null;
  favorites: string[];
  botConfigured: boolean;
};

export const DEFAULT_PREFERENCE: Preference = {
  latitude: null,
  longitude: null,
  district: "BZD",
  notificationRadiusKm: 5,
  telegramNotificationsEnabled: true,
  notifyOnAvailable: true,
  notifyOnArrivalTime: true,
  favoritesOnly: false,
  language: "mn",
};

/** Only the caller's own data; chat id is never exposed. */
export async function getMe(userId: string | null): Promise<Me> {
  const botConfigured = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
  if (!userId) return { preference: DEFAULT_PREFERENCE, telegram: null, favorites: [], botConfigured };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preference: true, telegram: true, favorites: { select: { stationId: true } } },
  });
  const p = user?.preference;
  return {
    preference: p
      ? {
          latitude: p.latitude,
          longitude: p.longitude,
          district: p.district,
          notificationRadiusKm: p.notificationRadiusKm,
          telegramNotificationsEnabled: p.telegramNotificationsEnabled,
          notifyOnAvailable: p.notifyOnAvailable,
          notifyOnArrivalTime: p.notifyOnArrivalTime,
          favoritesOnly: p.favoritesOnly,
          language: p.language,
        }
      : DEFAULT_PREFERENCE,
    telegram: user?.telegram
      ? { username: user.telegram.telegramUsername, firstName: user.telegram.firstName, connectedAt: user.telegram.connectedAt.toISOString() }
      : null,
    favorites: user?.favorites.map((f) => f.stationId) ?? [],
    botConfigured,
  };
}
