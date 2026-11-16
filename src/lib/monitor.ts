import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { errMsg, log } from "@/lib/log";
import { fetchFuelSnapshot, type ParsedStation } from "@/lib/fuel-api";
import { STATION_COORDINATES } from "@/lib/station-coordinates";
import { latestA92Rows } from "@/lib/stations";
import { distanceKm } from "@/lib/geo";
import { ubDate } from "@/lib/time";
import { prettifyAddress, type DistrictCode } from "@/lib/districts";
import { sendMessage, TelegramError } from "@/lib/telegram/api";
import { formatArrivalTimeAlert, formatAvailableAlert } from "@/lib/telegram/format";

const FUEL = "ai92"; // Euro-92 is deliberately never tracked or alerted.
const DISPATCH_WINDOW_MS = 15 * 60 * 1000; // events younger than this are (re)dispatched to users not yet notified

export type MonitorResult =
  | { skipped: true; reason: string }
  | { skipped: false; ok: boolean; runId: string; stations?: number; changes?: number; events?: number; sent?: number; error?: string };

export async function runMonitor({ force = false }: { force?: boolean } = {}): Promise<MonitorResult> {
  if (!force) {
    const last = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
    const minGapMs = (env.POLL_INTERVAL_SECONDS - 5) * 1000;
    if (last && Date.now() - last.startedAt.getTime() < minGapMs) {
      return { skipped: true, reason: "poll interval not elapsed" };
    }
  }

  const run = await prisma.syncRun.create({ data: {} });
  try {
    const snap = await fetchFuelSnapshot();
    const { changes, newEvents } = await persistSnapshot(snap.stations, run.startedAt);
    const sent = await dispatchNotifications();
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        ok: true,
        finishedAt: new Date(),
        sourceUpdatedAt: snap.updatedAt,
        stationCount: snap.stations.length,
        changes,
        events: newEvents,
        notificationsSent: sent,
      },
    });
    log("info", "monitor run ok", { runId: run.id, stations: snap.stations.length, skipped: snap.skipped, changes, newEvents, sent });
    return { skipped: false, ok: true, runId: run.id, stations: snap.stations.length, changes, events: newEvents, sent };
  } catch (e) {
    const error = errMsg(e).slice(0, 500);
    log("error", "monitor run failed", { runId: run.id, error });
    await prisma.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error } }).catch(() => {});
    return { skipped: false, ok: false, runId: run.id, error };
  }
}

/** Upsert stations, append changed ai92 states to history, and record meaningful events. */
async function persistSnapshot(parsed: ParsedStation[], runStartedAt: Date) {
  const existing = new Map((await prisma.fuelStation.findMany()).map((s) => [s.externalId, s]));

  // 1. Stations (new ones + metadata/coordinate changes). Small N (~110) — individual upserts are fine.
  for (const p of parsed) {
    const cur = existing.get(p.externalId);
    // Coordinates set by an admin in the DB are authoritative; the JSON dataset only seeds the rest.
    const coord = cur?.coordinateSource === "admin" ? undefined : STATION_COORDINATES[p.externalId];
    const data = {
      name: p.name,
      rawName: p.rawName,
      address: p.address,
      district: p.district,
      ...(coord
        ? { latitude: coord.lat, longitude: coord.lng, coordinateVerified: coord.verified, coordinateSource: coord.source ?? "dataset" }
        : {}),
      // Entry removed from the dataset (and not admin-managed) -> drop the stale coordinates.
      ...(!coord && cur?.coordinateSource && cur.coordinateSource !== "admin"
        ? { latitude: null, longitude: null, coordinateVerified: false, coordinateSource: null }
        : {}),
    };
    const changed =
      !cur ||
      cur.rawName !== data.rawName ||
      cur.district !== data.district ||
      (coord && (cur.latitude !== coord.lat || cur.longitude !== coord.lng || cur.coordinateVerified !== coord.verified)) ||
      (!coord && !!cur.coordinateSource && cur.coordinateSource !== "admin");
    if (changed) {
      const s = await prisma.fuelStation.upsert({ where: { externalId: p.externalId }, create: { externalId: p.externalId, ...data }, update: data });
      existing.set(p.externalId, s);
    }
  }

  const valid = parsed.filter((p) => p.a92.available !== null);
  await prisma.fuelStation.updateMany({
    where: { externalId: { in: valid.map((p) => p.externalId) } },
    data: { lastSeenAt: runStartedAt },
  });

  // 2. Diff against latest known state.
  const latest = await latestA92Rows();
  const history: Prisma.FuelAvailabilityCreateManyInput[] = [];
  const events: Prisma.AvailabilityEventCreateManyInput[] = [];
  const today = ubDate();

  for (const p of valid) {
    const station = existing.get(p.externalId)!;
    const prev = latest.get(station.id);
    const now = { ...p.a92, available: p.a92.available as boolean };
    const same =
      prev &&
      prev.available === now.available &&
      prev.arrivedAt === now.arrivedAt &&
      prev.emptyAt === now.emptyAt &&
      prev.limitPerPerson === now.limitPerPerson;
    if (same) continue;

    history.push({ stationId: station.id, fuelType: FUEL, ...now, recordedAt: runStartedAt });
    if (!prev) continue; // first observation is a baseline — never alert on it

    if (!prev.available && now.available) {
      // Key on the previous state row: concurrent runs see the same row and produce the same key.
      events.push({ key: `avail:${prev.id}`, stationId: station.id, fuelType: FUEL, type: "A92_AVAILABLE", arrivedAt: now.arrivedAt });
    } else if (now.arrivedAt && now.arrivedAt !== prev.arrivedAt) {
      events.push({
        key: `arrival:${station.id}:${today}:${now.arrivedAt}`,
        stationId: station.id,
        fuelType: FUEL,
        type: "A92_ARRIVAL_TIME",
        arrivedAt: now.arrivedAt,
      });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    if (history.length) await tx.fuelAvailability.createMany({ data: history });
    return events.length ? tx.availabilityEvent.createManyAndReturn({ data: events, skipDuplicates: true }) : [];
  });

  return { changes: history.length, newEvents: created.length };
}

type Recipient = {
  userId: string;
  chatId: bigint;
  lat: number | null;
  lng: number | null;
  district: string;
  radiusKm: number;
  notifyOnAvailable: boolean;
  notifyOnArrivalTime: boolean;
  favoritesOnly: boolean;
  favorites: Set<string>;
};

async function loadRecipients(): Promise<Recipient[]> {
  const conns = await prisma.telegramConnection.findMany({
    include: { user: { include: { preference: true, favorites: { select: { stationId: true } } } } },
  });
  return conns
    .filter((c) => c.user.preference?.telegramNotificationsEnabled ?? true)
    .map((c) => {
      const p = c.user.preference;
      return {
        userId: c.userId,
        chatId: c.chatId,
        lat: p?.latitude ?? null,
        lng: p?.longitude ?? null,
        district: p?.district ?? "BZD",
        radiusKm: p?.notificationRadiusKm ?? 5,
        notifyOnAvailable: p?.notifyOnAvailable ?? true,
        notifyOnArrivalTime: p?.notifyOnArrivalTime ?? true,
        favoritesOnly: p?.favoritesOnly ?? false,
        favorites: new Set(c.user.favorites.map((f) => f.stationId)),
      };
    });
}

/** Decide whether a user should hear about a station; returns distance (or null) when eligible, false otherwise. */
export function matchRecipient(
  r: Pick<Recipient, "lat" | "lng" | "district" | "radiusKm" | "favoritesOnly" | "favorites">,
  s: { id: string; latitude: number | null; longitude: number | null; district: string | null },
): { distanceKm: number | null } | false {
  const fav = r.favorites.has(s.id);
  const dist =
    r.lat != null && r.lng != null && s.latitude != null && s.longitude != null
      ? distanceKm({ lat: r.lat, lng: r.lng }, { lat: s.latitude, lng: s.longitude })
      : null;
  if (r.favoritesOnly) return fav ? { distanceKm: dist } : false;
  if (fav) return { distanceKm: dist };
  if (dist != null) return dist <= r.radiusKm ? { distanceKm: dist } : false;
  // No precise distance possible (no home pin or station not geolocated): fall back to same district.
  return s.district === r.district ? { distanceKm: null } : false;
}

async function dispatchNotifications(): Promise<number> {
  const events = await prisma.availabilityEvent.findMany({
    where: { createdAt: { gte: new Date(Date.now() - DISPATCH_WINDOW_MS) } },
    include: { station: true, notifications: { select: { userId: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!events.length) return 0;

  const recipients = await loadRecipients();
  if (!recipients.length) return 0;
  const latest = await latestA92Rows();
  const cooldownSince = new Date(Date.now() - env.NOTIFICATION_COOLDOWN_MINUTES * 60_000);
  let sent = 0;

  for (const ev of events) {
    const already = new Set(ev.notifications.map((n) => n.userId));
    const current = latest.get(ev.stationId);
    // Don't announce availability that has already disappeared again.
    if (ev.type === "A92_AVAILABLE" && !current?.available) continue;

    for (const r of recipients) {
      if (already.has(r.userId)) continue;
      if (ev.type === "A92_AVAILABLE" ? !r.notifyOnAvailable : !r.notifyOnArrivalTime) continue;
      const match = matchRecipient(r, ev.station);
      if (!match) continue;

      if (env.NOTIFICATION_COOLDOWN_MINUTES > 0) {
        const recent = await prisma.notificationHistory.findFirst({
          where: { userId: r.userId, stationId: ev.stationId, notificationType: ev.type, status: "SENT", sentAt: { gte: cooldownSince } },
          select: { id: true },
        });
        if (recent) continue;
      }

      // Claim (userId, eventId) atomically — unique constraint guarantees exactly-once across concurrent runs.
      let notifId: string;
      try {
        const n = await prisma.notificationHistory.create({
          data: {
            userId: r.userId,
            stationId: ev.stationId,
            eventId: ev.id,
            fuelType: ev.fuelType,
            notificationType: ev.type,
            distanceKm: match.distanceKm,
          },
        });
        notifId = n.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }

      const station = {
        name: ev.station.name,
        address: ev.station.address ? prettifyAddress(ev.station.address, ev.station.district as DistrictCode | null) : null,
        district: ev.station.district,
        lat: ev.station.latitude,
        lng: ev.station.longitude,
        coordinateVerified: ev.station.coordinateVerified,
        arrivedAt: current?.arrivedAt ?? ev.arrivedAt,
        limitPerPerson: current?.limitPerPerson ?? null,
      };
      const text =
        ev.type === "A92_AVAILABLE"
          ? formatAvailableAlert(station, match.distanceKm)
          : formatArrivalTimeAlert(station, !!current?.available, match.distanceKm);

      try {
        await sendMessage(r.chatId, text);
        await prisma.notificationHistory.update({ where: { id: notifId }, data: { status: "SENT", sentAt: new Date() } });
        sent++;
      } catch (e) {
        const error = errMsg(e).slice(0, 300);
        log("warn", "telegram delivery failed", { userId: r.userId, eventId: ev.id, error });
        await prisma.notificationHistory.update({ where: { id: notifId }, data: { status: "FAILED", error } });
        if (e instanceof TelegramError && e.isPermanent) {
          await prisma.telegramConnection.deleteMany({ where: { userId: r.userId } });
          r.notifyOnAvailable = r.notifyOnArrivalTime = false; // stop for this run
        }
      }
      await new Promise((res) => setTimeout(res, 40)); // stay well under 30 msg/s global limit
    }
  }
  return sent;
}

