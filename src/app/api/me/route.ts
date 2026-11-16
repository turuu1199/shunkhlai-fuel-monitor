import { connection, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { getMe } from "@/lib/me";
import { getUserId } from "@/lib/user";


export async function GET() {
  await connection();
  try {
    return NextResponse.json(await getMe(await getUserId()), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}
