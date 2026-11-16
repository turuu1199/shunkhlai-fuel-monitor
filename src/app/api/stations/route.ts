import { connection, NextResponse } from "next/server";
import { getFreshStationsData } from "@/lib/freshness";
import { handleRouteError } from "@/lib/http";


export async function GET() {
  await connection();
  try {
    const data = await getFreshStationsData();
    return NextResponse.json(data, { headers: { "cache-control": "private, max-age=15" } });
  } catch (e) {
    return handleRouteError(e);
  }
}
