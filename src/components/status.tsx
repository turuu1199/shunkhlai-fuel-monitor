import { cn } from "@/lib/utils";
import type { A92Status } from "@/lib/stations";
import type { Dict } from "@/lib/i18n";

export const STATUS_COLOR: Record<A92Status, string> = {
  available: "#16a34a",
  unavailable: "#dc2626",
  unknown: "#9ca3af",
};

export function StatusDot({ status, className }: { status: A92Status; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: STATUS_COLOR[status] }}
    />
  );
}

export function StatusBadge({ status, t }: { status: A92Status; t: Dict }) {
  const label = status === "available" ? t.fAvailable : status === "unavailable" ? t.fUnavailable : t.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "available" && "bg-green-600/15 text-green-700 dark:text-green-400",
        status === "unavailable" && "bg-red-600/10 text-red-700 dark:text-red-400",
        status === "unknown" && "bg-muted text-muted-foreground",
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
