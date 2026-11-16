"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n";
import type { Me } from "@/lib/me";

type Props = { me: Me; refreshMe: () => Promise<Me | null>; t: Dict };

export function TelegramPanel({ me, refreshMe, t }: Props) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setLink(data.url);
      window.open(data.url, "_blank", "noopener");
      const started = Date.now();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (Date.now() - started > 15 * 60_000) {
          clearInterval(pollRef.current!);
          setLink(null);
          return;
        }
        const next = await refreshMe();
        if (next?.telegram) {
          clearInterval(pollRef.current!);
          setLink(null);
          toast.success(t.tgConnectedOk);
        }
      }, 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/disconnect", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      await refreshMe();
      toast.success(t.tgDisconnectedOk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!me.botConfigured) return <p className="text-muted-foreground text-sm">{t.tgNotConfigured}</p>;

  if (me.telegram) {
    const who = me.telegram.username ? `@${me.telegram.username}` : (me.telegram.firstName ?? "Telegram");
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-2.5 rounded-full bg-green-600" />
          <span className="font-medium">{t.tgConnected}</span>
          <span className="text-muted-foreground">· {who}</span>
        </div>
        <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
          <Unlink /> {t.tgDisconnect}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2.5 rounded-full bg-zinc-400" />
        <span>{t.tgNotConnected}</span>
      </div>
      {link ? (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex">
            <Button size="sm"><Send /> {t.tgOpen}</Button>
          </a>
          <p className="text-muted-foreground text-xs">{t.tgWaiting}</p>
          <p className="text-muted-foreground text-xs">{t.tgExpires}</p>
        </div>
      ) : (
        <Button onClick={connect} disabled={busy}>
          <Send /> {t.tgConnect}
        </Button>
      )}
    </div>
  );
}
