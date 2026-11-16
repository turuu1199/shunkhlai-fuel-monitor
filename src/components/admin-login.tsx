"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLogin() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret }) });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? "Error");
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 py-16">
      <h1 className="text-lg font-semibold">🔐 Админ нэвтрэх</h1>
      <Input type="password" autoComplete="current-password" placeholder="ADMIN_SECRET" value={secret} onChange={(e) => setSecret(e.target.value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || !secret}>Нэвтрэх</Button>
    </form>
  );
}
