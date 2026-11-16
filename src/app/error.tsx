"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md space-y-3 px-4 py-20 text-center">
      <h1 className="text-lg font-semibold">⚠️ Алдаа гарлаа / Something went wrong</h1>
      <p className="text-muted-foreground text-sm">{error.digest ? `Ref: ${error.digest}` : "Мэдээллийн сантай холбогдож чадсангүй."}</p>
      <button onClick={reset} className="rounded-md border px-3 py-1.5 text-sm">Дахин оролдох / Retry</button>
    </main>
  );
}
