"use client";

import { MapPin, Star, Navigation } from "lucide-react";
import { StatusBadge } from "@/components/status";
import { fmtKm, mapsHref, type StationWithDistance } from "@/components/types";
import { districtName } from "@/lib/districts";
import type { Dict, Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  s: StationWithDistance;
  t: Dict;
  lang: Lang;
  favorite: boolean;
  onToggleFavorite: (id: string, fav: boolean) => void;
  onFocus: (s: StationWithDistance) => void;
};

export function StationRow({ s, t, lang, favorite, onToggleFavorite, onFocus }: Props) {
  const hasCoords = s.lat != null && s.lng != null;
  return (
    <li className={cn("flex gap-3 rounded-lg border p-3", s.status === "available" && "border-green-600/40 bg-green-600/5")}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.name}</span>
          <StatusBadge status={s.status} t={t} />
          {s.distanceKm != null && <span className="text-sm font-medium tabular-nums">{fmtKm(s.distanceKm, t.km)}</span>}
        </div>
        <p className="text-muted-foreground text-xs">
          {s.address ?? districtName(s.district, lang) ?? "—"}
          {s.address && s.district && <span className="ml-1 opacity-70">· {districtName(s.district, lang)}</span>}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {s.arrivedAt && <span>🕒 {t.arrived}: <b>{s.arrivedAt}</b></span>}
          {s.emptyAt && <span>⌛ {t.empty}: {s.emptyAt}</span>}
          {s.limitPerPerson && <span>👤 {t.limit}: {s.limitPerPerson}</span>}
          {!hasCoords && <span className="text-muted-foreground">📍 {t.noCoords}</span>}
          {hasCoords && !s.coordinateVerified && <span className="text-amber-600 dark:text-amber-500">⚠️ {t.unverified}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          aria-label={t.favorite}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(s.id, !favorite)}
          className="hover:bg-muted rounded-md p-1.5"
        >
          <Star className={cn("size-4", favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
        </button>
        {hasCoords && (
          <button type="button" aria-label={t.map} onClick={() => onFocus(s)} className="hover:bg-muted rounded-md p-1.5">
            <MapPin className="text-muted-foreground size-4" />
          </button>
        )}
        <a href={mapsHref(s)} target="_blank" rel="noreferrer" aria-label={t.openMaps} className="hover:bg-muted rounded-md p-1.5">
          <Navigation className="text-muted-foreground size-4" />
        </a>
      </div>
    </li>
  );
}
