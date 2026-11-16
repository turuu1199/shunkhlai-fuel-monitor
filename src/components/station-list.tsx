"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StationRow } from "@/components/station-row";
import type { StationWithDistance } from "@/components/types";
import type { Dict, Lang } from "@/lib/i18n";
import { ALL_DISTRICTS, districtName, inHomeDistrict } from "@/lib/districts";
import type { FuelType } from "@/lib/fuels";
import { cn } from "@/lib/utils";

type Filter = "all" | "available" | "unavailable";

type Props = {
  stations: StationWithDistance[];
  hasHome: boolean;
  radiusKm: number;
  favorites: Set<string>;
  onToggleFavorite: (id: string, fav: boolean) => void;
  onFocus: (s: StationWithDistance) => void;
  t: Dict;
  lang: Lang;
  homeDistrict: string;
  fuel: FuelType;
};

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function StationList({ stations, hasHome, radiusKm, favorites, onToggleFavorite, onFocus, t, lang, homeDistrict, fuel }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [bzd, setBzd] = useState(false);
  const [ubOnly, setUbOnly] = useState(true);
  const [byDistance, setByDistance] = useState(hasHome);
  const [inRadius, setInRadius] = useState(false);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = stations.filter(
      (s) =>
        (filter === "all" || s.status === filter) &&
        (!bzd || inHomeDistrict(s, homeDistrict)) &&
        (!ubOnly || s.isUB) &&
        (!inRadius || !hasHome || (s.distanceKm != null && s.distanceKm <= radiusKm)) &&
        (!needle || s.name.toLowerCase().includes(needle) || (s.address ?? "").toLowerCase().includes(needle)),
    );
    if (byDistance && hasHome) {
      out = [...out].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return out;
  }, [stations, filter, bzd, ubOnly, inRadius, hasHome, radiusKm, q, byDistance, homeDistrict]);

  const counts = {
    all: stations.length,
    available: stations.filter((s) => s.status === "available").length,
    unavailable: stations.filter((s) => s.status === "unavailable").length,
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="pl-8" aria-label={t.search} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>{t.fAll} {counts.all}</Chip>
        <Chip active={filter === "available"} onClick={() => setFilter("available")}>🟢 {t.fAvailable} {counts.available}</Chip>
        <Chip active={filter === "unavailable"} onClick={() => setFilter("unavailable")}>🔴 {t.fUnavailable} {counts.unavailable}</Chip>
        {homeDistrict !== ALL_DISTRICTS && (
          <Chip active={bzd} onClick={() => setBzd(!bzd)}>🏠 {districtName(homeDistrict, lang)}</Chip>
        )}
        <Chip active={ubOnly} onClick={() => setUbOnly(!ubOnly)}>{t.fUB}</Chip>
        <Chip active={byDistance && hasHome} disabled={!hasHome} onClick={() => setByDistance(!byDistance)}>↕ {t.sortDistance}</Chip>
        <Chip active={inRadius && hasHome} disabled={!hasHome} onClick={() => setInRadius(!inRadius)}>◎ {t.radiusFilter} ({radiusKm} {t.km})</Chip>
      </div>
      {list.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t.noStations}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => (
            <StationRow key={s.id} s={s} t={t} lang={lang} favorite={favorites.has(s.id)} onToggleFavorite={onToggleFavorite} onFocus={onFocus} fuel={fuel} />
          ))}
        </ul>
      )}
    </div>
  );
}
