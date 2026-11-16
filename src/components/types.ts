import type { StationView } from "@/lib/stations";

export type StationWithDistance = StationView & { distanceKm: number | null };
export type Home = { lat: number; lng: number } | null;

export function mapsHref(s: StationView): string {
  if (s.lat != null && s.lng != null) return `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Шунхлай ${s.name} ${s.address ?? ""}`)}`;
}

export function fmtKm(km: number | null, unit: string): string | null {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} ${unit}`;
}
