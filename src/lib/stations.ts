import "server-only";
import { prisma } from "@/lib/db";
import { STALE_AFTER_MS } from "@/lib/env";
import { isUlaanbaatar, prettifyAddress, type DistrictCode } from "@/lib/districts";

export type A92Status = "available" | "unavailable" | "unknown";

export type StationView = {
  id: string;
  externalId: string;
  name: string;
  address: string | null;
  district: string | null;
  isUB: boolean;
  lat: number | null;
  lng: number | null;
  coordinateVerified: boolean;
  status: A92Status;
  arrivedAt: string | null;
  emptyAt: string | null;
  limitPerPerson: string | null;
  changedAt: string | null;
};

export type SyncInfo = {
  lastOkAt: string | null;
  sourceUpdatedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  stale: boolean;
};

export type StationsData = { stations: StationView[]; sync: SyncInfo };

type LatestRow = {
  stationId: string;
  available: boolean;
  arrivedAt: string | null;
  emptyAt: string | null;
  limitPerPerson: string | null;
  recordedAt: Date;
};

export async function latestA92Rows(): Promise<Map<string, LatestRow & { id: string }>> {
  const rows = await prisma.$queryRaw<(LatestRow & { id: string })[]>`
    SELECT DISTINCT ON ("stationId") id, "stationId", available, "arrivedAt", "emptyAt", "limitPerPerson", "recordedAt"
    FROM "FuelAvailability"
    WHERE "fuelType" = 'ai92'
    ORDER BY "stationId", "recordedAt" DESC`;
  return new Map(rows.map((r) => [r.stationId, r]));
}

export async function getSyncInfo(): Promise<SyncInfo & { lastOkStartedAt: Date | null }> {
  const [ok, attempt] = await Promise.all([
    prisma.syncRun.findFirst({ where: { ok: true }, orderBy: { startedAt: "desc" } }),
    prisma.syncRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
  ]);
  return {
    lastOkStartedAt: ok?.startedAt ?? null,
    lastOkAt: ok?.finishedAt?.toISOString() ?? null,
    sourceUpdatedAt: ok?.sourceUpdatedAt?.toISOString() ?? null,
    lastAttemptAt: attempt?.finishedAt?.toISOString() ?? null,
    lastError: attempt && !attempt.ok ? attempt.error : null,
    stale: !ok?.finishedAt || Date.now() - ok.finishedAt.getTime() > STALE_AFTER_MS,
  };
}

export async function getStationsData(): Promise<StationsData> {
  const [stations, latest, syncFull] = await Promise.all([
    prisma.fuelStation.findMany({ orderBy: { name: "asc" } }),
    latestA92Rows(),
    getSyncInfo(),
  ]);
  const { lastOkStartedAt, ...sync } = syncFull;

  const views = stations.map((s): StationView => {
    const row = latest.get(s.id);
    // Unknown when: data stale, station had no valid ai92 in the last successful sync, or never recorded.
    const missing = !s.lastSeenAt || !lastOkStartedAt || s.lastSeenAt < lastOkStartedAt;
    const status: A92Status = !row || sync.stale || missing ? "unknown" : row.available ? "available" : "unavailable";
    return {
      id: s.id,
      externalId: s.externalId,
      name: s.name,
      address: s.address ? prettifyAddress(s.address, s.district as DistrictCode | null) : null,
      district: s.district,
      isUB: isUlaanbaatar(s.name, s.address),
      lat: s.latitude,
      lng: s.longitude,
      coordinateVerified: s.coordinateVerified,
      status,
      arrivedAt: row?.arrivedAt ?? null,
      emptyAt: row?.emptyAt ?? null,
      limitPerPerson: row?.limitPerPerson ?? null,
      changedAt: row?.recordedAt.toISOString() ?? null,
    };
  });
  return { stations: sortStations(views), sync };
}

/** Available first, then Bayanzurkh, then Ulaanbaatar, then by name (natural sort). */
export function sortStations<T extends Pick<StationView, "status" | "district" | "isUB" | "name">>(list: T[]): T[] {
  const rank = (s: T) => (s.status === "available" ? 0 : 4) + (s.district === "BZD" ? 0 : s.isUB ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "mn", { numeric: true }));
}
