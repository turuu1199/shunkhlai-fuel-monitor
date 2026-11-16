import "server-only";
import { prisma } from "@/lib/db";
import { STALE_AFTER_MS } from "@/lib/env";
import { isUlaanbaatar, prettifyAddress, type DistrictCode } from "@/lib/districts";
import { FUEL_TYPES, type FuelType } from "@/lib/fuels";

export type A92Status = "available" | "unavailable" | "unknown";

export type FuelView = {
  status: A92Status;
  arrivedAt: string | null;
  emptyAt: string | null;
  limitPerPerson: string | null;
};

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
  /** All fuels (ai92 duplicated in the top-level fields for convenience). */
  fuels: Record<FuelType, FuelView>;
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

/** Latest row per (station, fuel) for every fuel type. */
export async function latestFuelRows(): Promise<Map<string, Map<string, LatestRow>>> {
  const rows = await prisma.$queryRaw<(LatestRow & { fuelType: string })[]>`
    SELECT DISTINCT ON ("stationId", "fuelType") "stationId", "fuelType", available, "arrivedAt", "emptyAt", "limitPerPerson", "recordedAt"
    FROM "FuelAvailability"
    ORDER BY "stationId", "fuelType", "recordedAt" DESC`;
  const out = new Map<string, Map<string, LatestRow>>();
  for (const r of rows) {
    if (!out.has(r.stationId)) out.set(r.stationId, new Map());
    out.get(r.stationId)!.set(r.fuelType, r);
  }
  return out;
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
  const [stations, latestAll, syncFull] = await Promise.all([
    prisma.fuelStation.findMany({ orderBy: { name: "asc" } }),
    latestFuelRows(),
    getSyncInfo(),
  ]);
  const { lastOkStartedAt, ...sync } = syncFull;

  const views = stations.map((s): StationView => {
    const byFuel = latestAll.get(s.id);
    const row = byFuel?.get("ai92");
    // Unknown when: data stale, station had no valid ai92 in the last successful sync, or never recorded.
    const missing = !s.lastSeenAt || !lastOkStartedAt || s.lastSeenAt < lastOkStartedAt;
    const statusOf = (r: LatestRow | undefined): A92Status =>
      !r || sync.stale || missing ? "unknown" : r.available ? "available" : "unavailable";
    const status = statusOf(row);
    const fuels = Object.fromEntries(
      FUEL_TYPES.map((f) => {
        const r = byFuel?.get(f);
        return [f, { status: statusOf(r), arrivedAt: r?.arrivedAt ?? null, emptyAt: r?.emptyAt ?? null, limitPerPerson: r?.limitPerPerson ?? null }];
      }),
    ) as Record<FuelType, FuelView>;
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
      fuels,
    };
  });
  return { stations: sortStations(views), sync };
}

/** Available first, then Bayanzurkh, then Ulaanbaatar, then by name (natural sort). */
export function sortStations<T extends Pick<StationView, "status" | "district" | "isUB" | "name">>(list: T[]): T[] {
  const rank = (s: T) => (s.status === "available" ? 0 : 4) + (s.district === "BZD" ? 0 : s.isUB ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "mn", { numeric: true }));
}
