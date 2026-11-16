"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Fuel, Moon, Sun, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StationList } from "@/components/station-list";
import { StationRow } from "@/components/station-row";
import { SettingsPanel } from "@/components/settings-panel";
import { TelegramPanel } from "@/components/telegram-panel";
import type { Home, StationWithDistance } from "@/components/types";
import { distanceKm } from "@/lib/geo";
import { districtName } from "@/lib/districts";
import { DICT, type Lang } from "@/lib/i18n";
import type { Me, Preference } from "@/lib/me";
import type { StationsData } from "@/lib/stations";
import { cn } from "@/lib/utils";

const StationMap = dynamic(() => import("@/components/station-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const REFRESH_MS = 60_000;

function fmtTime(iso: string | null, lang: Lang) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "mn" ? "mn-MN" : "en-GB", {
    timeZone: "Asia/Ulaanbaatar",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function Dashboard({ initialData, initialMe }: { initialData: StationsData; initialMe: Me }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [data, setData] = useState(initialData);
  const [me, setMe] = useState(initialMe);
  const lang: Lang = me.preference.language;
  const t = DICT[lang];
  const [pickMode, setPickMode] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Keep the view fresh while open (monitoring itself runs server-side via cron).
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/stations", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch {
        /* keep last data; header shows staleness */
      }
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return null;
      const next: Me = await res.json();
      setMe(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const savePref = useCallback(
    async (patch: Partial<Preference>) => {
      const prev = me;
      setMe({ ...me, preference: { ...me.preference, ...patch } });
      try {
        const res = await fetch("/api/preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setMe(await res.json());
        return true;
      } catch {
        setMe(prev);
        toast.error(t.saveError);
        return false;
      }
    },
    [me, t],
  );

  const toggleFavorite = useCallback(
    async (stationId: string, favorite: boolean) => {
      const prev = me.favorites;
      setMe({ ...me, favorites: favorite ? [...prev, stationId] : prev.filter((id) => id !== stationId) });
      try {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stationId, favorite }),
        });
        if (!res.ok) throw new Error();
        const { favorites } = await res.json();
        setMe((m) => ({ ...m, favorites }));
      } catch {
        setMe((m) => ({ ...m, favorites: prev }));
        toast.error(t.saveError);
      }
    },
    [me, t],
  );

  const changeLang = (l: Lang) => {
    document.documentElement.lang = l;
    void savePref({ language: l });
  };

  const pref = me.preference;
  const home: Home = useMemo(
    () => (pref.latitude != null && pref.longitude != null ? { lat: pref.latitude, lng: pref.longitude } : null),
    [pref.latitude, pref.longitude],
  );
  const favorites = useMemo(() => new Set(me.favorites), [me.favorites]);

  const stations: StationWithDistance[] = useMemo(
    () =>
      data.stations.map((s) => ({
        ...s,
        distanceKm: home && s.lat != null && s.lng != null ? distanceKm(home, { lat: s.lat, lng: s.lng }) : null,
      })),
    [data.stations, home],
  );

  const available = stations.filter((s) => s.status === "available");
  const nearby = useMemo(() => {
    const list = available.filter((s) =>
      favorites.has(s.id) ||
      (home && s.distanceKm != null ? s.distanceKm <= pref.notificationRadiusKm : s.district === pref.district),
    );
    return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [available, favorites, home, pref.notificationRadiusKm, pref.district]);
  const nearestElsewhere = useMemo(
    () => (nearby.length ? null : [...available].filter((s) => s.distanceKm != null).sort((a, b) => a.distanceKm! - b.distanceKm!)[0] ?? null),
    [nearby, available],
  );

  const ub = stations.filter((s) => s.isUB);
  const counts = {
    total: ub.length,
    available: ub.filter((s) => s.status === "available").length,
    unavailable: ub.filter((s) => s.status === "unavailable").length,
  };
  const overall = data.sync.stale
    ? { label: t.overallUnknown, cls: "text-muted-foreground" }
    : nearby.length
      ? { label: t.overallGood, cls: "text-green-600" }
      : counts.available
        ? { label: t.overallSome, cls: "text-amber-600" }
        : { label: t.overallNone, cls: "text-red-600" };

  const focusStation = (s: StationWithDistance) => {
    if (s.lat == null || s.lng == null) return;
    setFocus({ lat: s.lat, lng: s.lng });
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onPick = async (lat: number, lng: number) => {
    setPickMode(false);
    if (await savePref({ latitude: lat, longitude: lng })) toast.success(t.saved);
  };

  const unlocated = stations.filter((s) => s.isUB && (s.lat == null || s.lng == null)).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      {/* 1. Header */}
      <header className="bg-background/90 sticky top-0 z-[1000] -mx-4 mb-4 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
        <Fuel className="size-6 text-green-600" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base leading-tight font-semibold">{t.appName}</h1>
          <p className="text-muted-foreground truncate text-xs">
            {t.lastUpdate}: {fmtTime(data.sync.lastOkAt, lang)}
            {data.sync.sourceUpdatedAt && <span className="hidden sm:inline"> · {t.sourceTime}: {fmtTime(data.sync.sourceUpdatedAt, lang)}</span>}
          </p>
        </div>
        {(data.sync.stale || data.sync.lastError) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400" title={data.sync.lastError ?? ""}>
            <AlertTriangle className="size-3" /> {data.sync.stale ? t.stale : t.apiError}
          </span>
        )}
        <button type="button" onClick={() => changeLang(lang === "mn" ? "en" : "mn")} className="hover:bg-muted rounded-md px-2 py-1 text-xs font-semibold">
          {lang === "mn" ? "EN" : "МН"}
        </button>
        <button type="button" aria-label={t.theme} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="hover:bg-muted rounded-md p-1.5">
          <Sun className="hidden size-4 dark:block" />
          <Moon className="size-4 dark:hidden" />
        </button>
      </header>

      {/* 2. Summary */}
      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`${t.total} (УБ)`} value={counts.total} />
        <Stat label={t.available} value={counts.available} cls="text-green-600" />
        <Stat label={t.unavailable} value={counts.unavailable} cls="text-red-600" />
        <Stat label={t.overall} value={overall.label} cls={overall.cls} small />
      </section>

      {/* 3. Map */}
      <section ref={mapRef} className={cn("relative mb-4 h-[55vh] min-h-[320px] overflow-hidden rounded-xl border", pickMode && "ring-2 ring-blue-500")}>
        <StationMap
          stations={stations}
          home={home}
          radiusKm={pref.notificationRadiusKm}
          pickMode={pickMode}
          onPick={onPick}
          focus={focus}
          t={t}
          lang={lang}
        />
        <div className="bg-background/90 pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md px-2 py-1 text-[11px] shadow">
          <span className="mr-2">🟢 {t.fAvailable}</span>
          <span className="mr-2">🔴 {t.fUnavailable}</span>
          <span className="mr-2">⚪ {t.unknown}</span>
          <span>◌ {t.unverified}</span>
          {unlocated > 0 && <div className="text-muted-foreground">📍 {unlocated} {t.noCoords}</div>}
        </div>
        {pickMode && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-md bg-blue-600 px-3 py-1 text-xs text-white shadow">
            {t.setOnMapHint}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* 4. Nearby */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                📍 {t.nearby}
                <span className="text-muted-foreground text-xs font-normal">
                  {home ? `≤ ${pref.notificationRadiusKm} ${t.km}` : districtName(pref.district, lang)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nearby.length ? (
                <ul className="space-y-2">
                  {nearby.slice(0, 8).map((s) => (
                    <StationRow key={s.id} s={s} t={t} lang={lang} favorite={favorites.has(s.id)} onToggleFavorite={toggleFavorite} onFocus={focusStation} />
                  ))}
                </ul>
              ) : (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-sm">{data.sync.stale ? t.stale : t.nearbyNone}</p>
                  {nearestElsewhere && (
                    <>
                      <p className="text-xs font-medium">{t.nearestElsewhere}:</p>
                      <ul>
                        <StationRow s={nearestElsewhere} t={t} lang={lang} favorite={favorites.has(nearestElsewhere.id)} onToggleFavorite={toggleFavorite} onFocus={focusStation} />
                      </ul>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5. All stations */}
          <Card>
            <CardHeader>
              <CardTitle>⛽ {t.allStations}</CardTitle>
            </CardHeader>
            <CardContent>
              <StationList
                stations={stations}
                hasHome={!!home}
                radiusKm={pref.notificationRadiusKm}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onFocus={focusStation}
                t={t}
                lang={lang}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start" id="settings">
          {/* 6. Settings */}
          <Card>
            <CardHeader>
              <CardTitle>⚙️ {t.settings}</CardTitle>
            </CardHeader>
            <CardContent>
              <SettingsPanel pref={pref} onSave={savePref} pickMode={pickMode} setPickMode={setPickMode} t={t} lang={lang} />
            </CardContent>
          </Card>
          {/* 7. Telegram */}
          <Card>
            <CardHeader>
              <CardTitle>✈️ {t.telegram}</CardTitle>
            </CardHeader>
            <CardContent>
              <TelegramPanel me={me} refreshMe={refreshMe} t={t} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, cls, small }: { label: string; value: number | string; cls?: string; small?: boolean }) {
  return (
    <Card size="sm" className="gap-1 py-3">
      <CardContent className="px-3">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className={cn("font-semibold tabular-nums", small ? "text-base leading-7" : "text-2xl", cls)}>{value}</div>
      </CardContent>
    </Card>
  );
}
