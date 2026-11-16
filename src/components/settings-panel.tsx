"use client";

import { useState } from "react";
import { Crosshair, LocateFixed, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ALL_DISTRICTS, DISTRICTS, districtName } from "@/lib/districts";
import type { Dict, Lang } from "@/lib/i18n";
import type { Preference } from "@/lib/me";
import { cn } from "@/lib/utils";

const RADII = [1, 2, 3, 5, 10, 15, 20];

type Props = {
  pref: Preference;
  onSave: (patch: Partial<Preference>) => Promise<boolean>;
  pickMode: boolean;
  setPickMode: (v: boolean) => void;
  t: Dict;
  lang: Lang;
};

function Row({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Label htmlFor={id} className={cn("text-sm font-normal", disabled && "opacity-50")}>{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(Boolean(v))} />
    </div>
  );
}

export function SettingsPanel({ pref, onSave, pickMode, setPickMode, t, lang }: Props) {
  const [locating, setLocating] = useState(false);

  const useGps = () => {
    if (!("geolocation" in navigator)) return toast.error(t.geoDenied);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        if (await onSave({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })) toast.success(t.saved);
      },
      () => {
        setLocating(false);
        toast.error(t.geoDenied);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const hasHome = pref.latitude != null && pref.longitude != null;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="district">{t.homeDistrict}</Label>
        <select
          id="district"
          value={pref.district}
          onChange={(e) => onSave({ district: e.target.value })}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value={ALL_DISTRICTS}>{districtName(ALL_DISTRICTS, lang)}</option>
          {DISTRICTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d[lang]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>{t.homeLocation}</Label>
        <p className="text-muted-foreground text-xs">
          {hasHome ? `${pref.latitude!.toFixed(5)}, ${pref.longitude!.toFixed(5)}` : t.homeNotSet}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={pickMode ? "default" : "outline"} onClick={() => setPickMode(!pickMode)}>
            <Crosshair /> {t.setOnMap}
          </Button>
          <Button size="sm" variant="outline" onClick={useGps} disabled={locating}>
            <LocateFixed /> {locating ? t.loading : t.useGps}
          </Button>
          {hasHome && (
            <Button size="sm" variant="ghost" onClick={() => onSave({ latitude: null, longitude: null })}>
              <X /> {t.clearLocation}
            </Button>
          )}
        </div>
        {pickMode && <p className="text-xs font-medium text-blue-600">👆 {t.setOnMapHint}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>{t.radius}: {pref.notificationRadiusKm} {t.km}</Label>
        <div className="flex flex-wrap gap-1.5">
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSave({ notificationRadiusKm: r })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs tabular-nums",
                pref.notificationRadiusKm === r ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
              )}
            >
              {r} {t.km}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-1 block">{t.notifications}</Label>
        <Row id="n-en" label={t.notifEnabled} checked={pref.telegramNotificationsEnabled} onChange={(v) => onSave({ telegramNotificationsEnabled: v })} />
        <Row id="n-av" label={t.notifAvailable} checked={pref.notifyOnAvailable} disabled={!pref.telegramNotificationsEnabled} onChange={(v) => onSave({ notifyOnAvailable: v })} />
        <Row id="n-ar" label={t.notifArrival} checked={pref.notifyOnArrivalTime} disabled={!pref.telegramNotificationsEnabled} onChange={(v) => onSave({ notifyOnArrivalTime: v })} />
        <Row id="n-fav" label={`⭐ ${t.favoritesOnly}`} checked={pref.favoritesOnly} disabled={!pref.telegramNotificationsEnabled} onChange={(v) => onSave({ favoritesOnly: v })} />
        <p className="text-muted-foreground mt-2 text-xs">{t.euroNote}</p>
      </div>
    </div>
  );
}
