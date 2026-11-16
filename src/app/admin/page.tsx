import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminLogin } from "@/components/admin-login";
import { AdminStations, type AdminStation } from "@/components/admin-stations";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isUlaanbaatar, prettifyAddress, type DistrictCode } from "@/lib/districts";
import { sortStations } from "@/lib/stations";

export const metadata: Metadata = { title: "Админ — ШТС байршил", robots: { index: false } };

async function AdminContent() {
  if (!(await isAdmin())) return <AdminLogin />;
  const rows = await prisma.fuelStation.findMany();
  const stations: AdminStation[] = sortStations(
    rows.map((s) => ({
      id: s.id,
      externalId: s.externalId,
      name: s.name,
      address: s.address ? prettifyAddress(s.address, s.district as DistrictCode | null) : null,
      district: s.district,
      isUB: isUlaanbaatar(s.name, s.address),
      latitude: s.latitude,
      longitude: s.longitude,
      coordinateVerified: s.coordinateVerified,
      coordinateSource: s.coordinateSource,
      status: "unknown" as const,
    })),
  );
  return <AdminStations initial={stations} />;
}

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold">📍 ШТС байршлын тохиргоо</h1>
        <Link href="/" className="text-sm underline">← Dashboard</Link>
      </header>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <AdminContent />
      </Suspense>
    </main>
  );
}
