import "server-only";
import { z } from "zod";
import raw from "../../data/station-coordinates.json";

const entry = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  verified: z.boolean().default(false),
  source: z.string().optional(),
});

const file = z.object({ stations: z.record(z.string(), entry) });

export type StationCoordinate = z.infer<typeof entry>;

export const STATION_COORDINATES: Record<string, StationCoordinate> = file.parse(raw).stations;
