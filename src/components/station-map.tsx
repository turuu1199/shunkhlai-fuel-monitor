"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { STATUS_COLOR } from "@/components/status";
import { fmtKm, mapsHref, type Home, type StationWithDistance } from "@/components/types";
import { UB_MAP_CENTER, districtName } from "@/lib/districts";
import type { Dict, Lang } from "@/lib/i18n";

type Props = {
  stations: StationWithDistance[];
  home: Home;
  radiusKm: number;
  pickMode: boolean;
  onPick: (lat: number, lng: number) => void;
  focus: { lat: number; lng: number } | null;
  t: Dict;
  lang: Lang;
};

function ClickHandler({ enabled, onPick }: { enabled: boolean; onPick: Props["onPick"] }) {
  useMapEvents({ click: (e) => enabled && onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.5 });
  }, [target, map]);
  return null;
}

export default function StationMap({ stations, home, radiusKm, pickMode, onPick, focus, t, lang }: Props) {
  const located = stations.filter((s) => s.lat != null && s.lng != null);
  return (
    <MapContainer
      center={home ? [home.lat, home.lng] : UB_MAP_CENTER}
      zoom={12}
      className="h-full w-full"
      style={{ cursor: pickMode ? "crosshair" : undefined }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler enabled={pickMode} onPick={onPick} />
      <FlyTo target={focus} />
      {home && (
        <>
          <Circle center={[home.lat, home.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#2563eb", weight: 1, fillOpacity: 0.05 }} />
          <CircleMarker center={[home.lat, home.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
            <Tooltip>{t.home}</Tooltip>
          </CircleMarker>
        </>
      )}
      {located.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat!, s.lng!]}
          radius={s.status === "available" ? 10 : 7}
          pathOptions={{
            color: s.coordinateVerified ? "#fff" : STATUS_COLOR[s.status],
            weight: 2,
            dashArray: s.coordinateVerified ? undefined : "3 3",
            fillColor: STATUS_COLOR[s.status],
            fillOpacity: s.coordinateVerified ? 0.95 : 0.55,
          }}
        >
          <Popup>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">{s.name}</div>
              <div className="text-xs opacity-80">{s.address ?? districtName(s.district, lang)}</div>
              <div>
                ⛽ АИ-92:{" "}
                <b style={{ color: STATUS_COLOR[s.status] }}>
                  {s.status === "available" ? t.fAvailable : s.status === "unavailable" ? t.fUnavailable : t.unknown}
                </b>
              </div>
              {s.arrivedAt && <div>🕒 {t.arrived}: {s.arrivedAt}</div>}
              {s.emptyAt && <div>⌛ {t.empty}: {s.emptyAt}</div>}
              {s.limitPerPerson && <div>👤 {t.limit}: {s.limitPerPerson}</div>}
              {s.distanceKm != null && <div>📏 {fmtKm(s.distanceKm, t.km)}</div>}
              {!s.coordinateVerified && <div className="text-amber-600">⚠️ {t.unverified}</div>}
              <a href={mapsHref(s)} target="_blank" rel="noreferrer">
                {t.openMaps} ↗
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
