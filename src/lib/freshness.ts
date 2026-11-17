import "server-only";
import { after } from "next/server";
import { env } from "@/lib/env";
import { log, errMsg } from "@/lib/log";
import { runMonitor } from "@/lib/monitor";
import { getStationsData, type StationsData } from "@/lib/stations";

/**
 * Reads the DB snapshot. Cron is the primary trigger; as a safety net, a page view kicks off a sync
 * before responding (up to 8s) when data is older than 2× the poll interval (or awaits it on a brand-new DB).
 */
export async function getFreshStationsData(): Promise<StationsData> {
  let data = await getStationsData();
  if (data.stations.length === 0) {
    await runMonitor({ force: true });
    data = await getStationsData();
  } else {
    const age = data.sync.lastOkAt ? Date.now() - new Date(data.sync.lastOkAt).getTime() : Infinity;
    if (age > env.POLL_INTERVAL_SECONDS * 2000) {
      // Stale: refresh before responding (bounded), so the viewer never sees hour-old data.
      const sync = runMonitor().catch((e) => log("error", "on-view sync failed", { error: errMsg(e) }));
      const done = await Promise.race([sync.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), 8000))]);
      if (done) data = await getStationsData();
      else after(() => sync);
    }
  }
  return data;
}
