import "server-only";
import { after } from "next/server";
import { env } from "@/lib/env";
import { log, errMsg } from "@/lib/log";
import { runMonitor } from "@/lib/monitor";
import { getStationsData, type StationsData } from "@/lib/stations";

/**
 * Reads the DB snapshot. Cron is the primary trigger; as a safety net, a page view kicks off a sync
 * after the response when data is older than 2× the poll interval (or awaits it on a brand-new DB).
 */
export async function getFreshStationsData(): Promise<StationsData> {
  let data = await getStationsData();
  if (data.stations.length === 0) {
    await runMonitor({ force: true });
    data = await getStationsData();
  } else {
    const age = data.sync.lastOkAt ? Date.now() - new Date(data.sync.lastOkAt).getTime() : Infinity;
    if (age > env.POLL_INTERVAL_SECONDS * 2000) {
      after(() => runMonitor().catch((e) => log("error", "background sync failed", { error: errMsg(e) })));
    }
  }
  return data;
}
