"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { UB_MAP_CENTER } from "@/lib/districts";
import type { AdminStation } from "@/components/admin-stations";

type Props = {
  stations: AdminStation[];
  selectedId: string | null;
  draft: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  onSelect: (id: string) => void;
};

function Picker({ onPick }: { onPick: Props["onPick"] }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

function Follow({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.panTo([target.lat, target.lng]);
  }, [target, map]);
  return null;
}

export default function AdminMap({ stations, selectedId, draft, onPick, onSelect }: Props) {
  return (
    <MapContainer center={UB_MAP_CENTER} zoom={12} className="h-full w-full" style={{ cursor: "crosshair" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Picker onPick={onPick} />
      <Follow target={draft} />
      {stations
        .filter((s) => s.latitude != null && s.longitude != null && s.id !== selectedId)
        .map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.latitude!, s.longitude!]}
            radius={6}
            eventHandlers={{ click: () => onSelect(s.id) }}
            pathOptions={{ color: s.coordinateVerified ? "#16a34a" : "#d97706", weight: 2, dashArray: s.coordinateVerified ? undefined : "3 3", fillOpacity: 0.4 }}
          >
            <Tooltip>{s.name}</Tooltip>
          </CircleMarker>
        ))}
      {draft && (
        <CircleMarker center={[draft.lat, draft.lng]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
          <Tooltip permanent direction="top">{stations.find((s) => s.id === selectedId)?.name}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
