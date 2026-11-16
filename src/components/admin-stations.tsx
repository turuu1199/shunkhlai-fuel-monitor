"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const AdminMap = dynamic(() => import("@/components/admin-map"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

export type AdminStation = {
  id: string;
  externalId: string;
  name: string;
  address: string | null;
  district: string | null;
  isUB: boolean;
  latitude: number | null;
  longitude: number | null;
  coordinateVerified: boolean;
  coordinateSource: string | null;
};

/** Accepts "47.9123, 106.9456", "47.9123 106.9456" or a Google Maps URL containing "@lat,lng" / "query=lat,lng". */
function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return lat >= 41 && lat <= 53 && lng >= 87 && lng <= 120 ? { lat, lng } : null;
}

export function AdminStations({ initial }: { initial: AdminStation[] }) {
  const [stations, setStations] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [text, setText] = useState("");
  const [verified, setVerified] = useState(true);
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [ubOnly, setUbOnly] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = stations.find((s) => s.id === selectedId) ?? null;
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return stations.filter(
      (s) =>
        (!ubOnly || s.isUB) &&
        (!onlyMissing || s.latitude == null || !s.coordinateVerified) &&
        (!n || s.name.toLowerCase().includes(n) || (s.address ?? "").toLowerCase().includes(n) || s.externalId.includes(n)),
    );
  }, [stations, q, ubOnly, onlyMissing]);

  const select = (id: string) => {
    const s = stations.find((x) => x.id === id)!;
    setSelectedId(id);
    const d = s.latitude != null && s.longitude != null ? { lat: s.latitude, lng: s.longitude } : null;
    setDraft(d);
    setText(d ? `${d.lat}, ${d.lng}` : "");
    setVerified(s.latitude == null ? true : s.coordinateVerified);
  };

  const save = async (clear = false) => {
    if (!selected) return;
    const coords = clear ? null : draft;
    if (!clear && !coords) return toast.error("Координат оруулна уу (газрын зураг дээр дарах эсвэл lat, lng бичих)");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/stations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null, verified }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setStations((all) => all.map((s) => (s.id === data.id ? { ...s, ...data } : s)));
      if (clear) {
        setDraft(null);
        setText("");
      }
      toast.success(clear ? "Координат устгалаа" : "Хадгаллаа");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const missing = stations.filter((s) => s.isUB && s.latitude == null).length;
  const unverified = stations.filter((s) => s.isUB && s.latitude != null && !s.coordinateVerified).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs">
          УБ: {missing} ШТС координатгүй · {unverified} баталгаажаагүй
        </p>
        <Input placeholder="Нэр, хаяг, ID хайх…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={ubOnly} onChange={(e) => setUbOnly(e.target.checked)} /> Зөвхөн УБ</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Координатгүй / баталгаажаагүй</label>
        </div>
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => select(s.id)}
                className={cn("hover:bg-muted w-full rounded-md border p-2 text-left text-sm", s.id === selectedId && "border-blue-500 bg-blue-500/10")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs">
                    {s.latitude == null ? "❌ байхгүй" : s.coordinateVerified ? "✅ баталгаажсан" : "⚠️ баталгаажаагүй"}
                  </span>
                </div>
                <div className="text-muted-foreground truncate text-xs">#{s.externalId} · {s.address ?? "—"}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="h-[55vh] min-h-[320px] overflow-hidden rounded-xl border">
          <AdminMap
            stations={stations}
            selectedId={selectedId}
            draft={draft}
            onSelect={select}
            onPick={(lat, lng) => {
              if (!selected) return toast.info("Эхлээд жагсаалтаас ШТС сонгоно уу");
              setDraft({ lat, lng });
              setText(`${lat}, ${lng}`);
            }}
          />
        </div>
        {selected ? (
          <div className="space-y-2 rounded-xl border p-3">
            <div className="text-sm font-medium">{selected.name} <span className="text-muted-foreground text-xs">#{selected.externalId}</span></div>
            <div className="text-muted-foreground text-xs">{selected.address}</div>
            {selected.coordinateSource && <div className="text-muted-foreground text-xs">Эх сурвалж: {selected.coordinateSource}</div>}
            <Input
              placeholder="47.9123, 106.9456 эсвэл Google Maps линк"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDraft(parseLatLng(e.target.value));
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Баталгаажсан (нүдээр шалгасан)
            </label>
            <div className="flex gap-2">
              <Button onClick={() => save()} disabled={saving || !draft}>Хадгалах</Button>
              {selected.latitude != null && (
                <Button variant="outline" onClick={() => save(true)} disabled={saving}>Координат устгах</Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">Газрын зураг дээр дарж эсвэл Google Maps-аас хуулсан координатыг буулгана уу.</p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Жагсаалтаас ШТС сонгоод газрын зураг дээр байршлыг нь дарна уу.</p>
        )}
      </div>
    </div>
  );
}
