import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, adminCookieValue } from "@/lib/admin";
import { env } from "@/lib/env";
import { handleRouteError, safeEqual } from "@/lib/http";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { HttpError } from "@/lib/user";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (!(await rateLimit(`admin-login:${ip}`, 5, 600))) throw new HttpError(429, "Too many attempts");
    const { secret } = z.object({ secret: z.string().min(1).max(256) }).parse(await req.json());
    const value = adminCookieValue();
    if (!value) throw new HttpError(503, "ADMIN_SECRET is not configured");
    if (!safeEqual(secret, env.ADMIN_SECRET)) {
      log("warn", "admin login failed", { ip });
      throw new HttpError(401, "Wrong password");
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, value, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
