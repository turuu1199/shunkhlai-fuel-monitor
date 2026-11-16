import "server-only";
import { prisma } from "@/lib/db";

/** Fixed-window limiter stored in Postgres (shared across serverless instances). Returns true if allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowEnd")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowEnd" < now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowEnd" = CASE WHEN "RateLimit"."windowEnd" < now() THEN now() + make_interval(secs => ${windowSeconds}::double precision) ELSE "RateLimit"."windowEnd" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}
