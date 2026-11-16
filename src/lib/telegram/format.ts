import "server-only";
import { escapeHtml as h } from "@/lib/telegram/api";
import { formatKm, googleMapsUrl } from "@/lib/geo";
import { districtName } from "@/lib/districts";
import { ubTime } from "@/lib/time";
import type { StationView, SyncInfo } from "@/lib/stations";

type StationLike = Pick<StationView, "name" | "address" | "district" | "lat" | "lng" | "coordinateVerified"> & {
  arrivedAt?: string | null;
  emptyAt?: string | null;
  limitPerPerson?: string | null;
};

export function mapsLink(s: StationLike): string {
  if (s.lat != null && s.lng != null) return googleMapsUrl(s.lat, s.lng);
  const q = ["Шунхлай", s.name, s.address ?? districtName(s.district) ?? ""].join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function location(s: StationLike) {
  return s.address ?? districtName(s.district) ?? "—";
}

export function formatAvailableAlert(s: StationLike, distanceKm: number | null): string {
  const lines = [
    "⛽ <b>A92 БЕНЗИН ИРЛЭЭ!</b>",
    "",
    `📍 ШТС: <b>${h(s.name)}</b>`,
    `📌 Байршил: ${h(location(s))}`,
    "⛽ Төрөл: АИ-92",
  ];
  if (s.arrivedAt) lines.push(`🕒 Ирсэн цаг: ${h(s.arrivedAt)}`);
  if (s.limitPerPerson) lines.push(`👤 Нэг хүнд: ${h(s.limitPerPerson)}`);
  if (distanceKm != null) lines.push("", `📏 Таны байршлаас: ${formatKm(distanceKm)}`);
  if (s.lat != null && !s.coordinateVerified) lines.push("⚠️ Байршил баталгаажаагүй");
  lines.push("", `<a href="${mapsLink(s)}">🗺 Google Maps-д харах</a>`);
  return lines.join("\n");
}

export function formatArrivalTimeAlert(s: StationLike, available: boolean, distanceKm: number | null): string {
  const lines = [
    "🕒 <b>АИ-92 ИРСЭН ЦАГ ШИНЭЧЛЭГДЛЭЭ</b>",
    "",
    `📍 ШТС: <b>${h(s.name)}</b>`,
    `📌 Байршил: ${h(location(s))}`,
    `🕒 Ирсэн цаг: ${h(s.arrivedAt ?? "—")}`,
    `📊 Одоогийн төлөв: ${available ? "🟢 Байгаа" : "🔴 Байхгүй"}`,
  ];
  if (s.limitPerPerson) lines.push(`👤 Нэг хүнд: ${h(s.limitPerPerson)}`);
  if (distanceKm != null) lines.push("", `📏 Таны байршлаас: ${formatKm(distanceKm)}`);
  lines.push("", `<a href="${mapsLink(s)}">🗺 Google Maps-д харах</a>`);
  return lines.join("\n");
}

export function formatStationLine(s: StationView, distanceKm?: number | null): string {
  const parts = [`🟢 <b>${h(s.name)}</b>`];
  const meta = [
    distanceKm != null ? `📏 ${formatKm(distanceKm)}` : null,
    s.arrivedAt ? `🕒 ${h(s.arrivedAt)}` : null,
    s.limitPerPerson ? `👤 ${h(s.limitPerPerson)}` : null,
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join(" · "));
  parts.push(`📌 ${h(location(s))} — <a href="${mapsLink(s)}">Map</a>`);
  return parts.join("\n");
}

export function formatSyncFooter(sync: SyncInfo): string {
  if (sync.stale) return "⚠️ Мэдээлэл хуучирсан байж магадгүй (API холболт алдаатай).";
  return `🔄 Шинэчилсэн: ${ubTime(sync.lastOkAt) ?? "—"}`;
}
