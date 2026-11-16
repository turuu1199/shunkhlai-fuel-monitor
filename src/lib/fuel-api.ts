import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { isUlaanbaatar, parseDistrict, type DistrictCode } from "@/lib/districts";
import { FUEL_TYPES, type FuelType } from "@/lib/fuels";

/** Source is loosely typed; every field is validated and anything unexpected becomes "unknown". */
const fuelSchema = z
  .object({
    available: z.boolean().nullable().optional(),
    arrivedAt: z.union([z.string(), z.number()]).nullable().optional(),
    emptyAt: z.union([z.string(), z.number()]).nullable().optional(),
    limitPerPerson: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .passthrough();

const stationSchema = z.object({
  stationName: z.string().min(1),
  fuels: z.record(z.string(), z.unknown()).default({}),
});

const responseSchema = z.object({
  updatedAt: z.string().nullable().optional(),
  stations: z.record(z.string(), z.unknown()),
});

export type FuelState = {
  available: boolean | null; // null = unknown / malformed
  arrivedAt: string | null;
  emptyAt: string | null;
  limitPerPerson: string | null;
};

export type ParsedStation = {
  externalId: string;
  rawName: string;
  name: string;
  address: string | null;
  district: DistrictCode | null;
  isUB: boolean;
  a92: FuelState;
  fuels: Record<FuelType, FuelState>;
};

export type A92State = FuelState;

export type FuelSnapshot = { updatedAt: Date | null; stations: ParsedStation[]; skipped: number };

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 64) : null;
};

export function splitStationName(raw: string): { name: string; address: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return { name: clean, address: null };
  const inner = m[2].trim();
  if (/^\d+$/.test(inner)) return { name: clean, address: null }; // "(214)" is an internal code
  return { name: m[1].trim(), address: inner };
}

function parseFuel(value: unknown): FuelState {
  const r = fuelSchema.safeParse(value);
  if (!r.success) return { available: null, arrivedAt: null, emptyAt: null, limitPerPerson: null };
  return {
    available: typeof r.data.available === "boolean" ? r.data.available : null,
    arrivedAt: str(r.data.arrivedAt),
    emptyAt: str(r.data.emptyAt),
    limitPerPerson: str(r.data.limitPerPerson),
  };
}

export function parseFuelResponse(json: unknown): FuelSnapshot {
  const root = responseSchema.parse(json);
  const stations: ParsedStation[] = [];
  let skipped = 0;
  for (const [externalId, value] of Object.entries(root.stations)) {
    const s = stationSchema.safeParse(value);
    if (!s.success || !/^\d+$/.test(externalId)) {
      skipped++;
      continue;
    }
    const { name, address } = splitStationName(s.data.stationName);
    stations.push({
      externalId,
      rawName: s.data.stationName.trim(),
      name,
      address,
      district: parseDistrict(address),
      isUB: isUlaanbaatar(name, address),
      ...(() => {
        const fuels = Object.fromEntries(FUEL_TYPES.map((f) => [f, parseFuel(s.data.fuels[f])])) as Record<FuelType, FuelState>;
        return { fuels, a92: fuels.ai92 };
      })(),
    });
  }
  const d = root.updatedAt ? new Date(root.updatedAt) : null;
  return { updatedAt: d && !isNaN(d.getTime()) ? d : null, stations, skipped };
}

/** Server-side fetch with timeout + one retry. Source sends cache-control max-age=30. */
export async function fetchFuelSnapshot(): Promise<FuelSnapshot> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(env.FUEL_API_URL, {
        signal: AbortSignal.timeout(env.FUEL_API_TIMEOUT_MS),
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Fuel API HTTP ${res.status}`);
      const snap = parseFuelResponse(await res.json());
      if (snap.stations.length === 0) throw new Error("Fuel API returned no valid stations");
      return snap;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
