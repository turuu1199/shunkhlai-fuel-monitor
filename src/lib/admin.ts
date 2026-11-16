import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/http";
import { sessionSecret } from "@/lib/session-token";
import { HttpError } from "@/lib/user";

export const ADMIN_COOKIE = "fm_admin";

/** Cookie value = HMAC(ADMIN_SECRET) — rotating ADMIN_SECRET logs every admin out. */
export function adminCookieValue(): string | null {
  const secret = sessionSecret();
  if (!env.ADMIN_SECRET || !secret) return null;
  return createHmac("sha256", secret).update(`admin:${env.ADMIN_SECRET}`).digest("base64url");
}

export async function isAdmin(): Promise<boolean> {
  const expected = adminCookieValue();
  const got = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(expected && got && safeEqual(got, expected));
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new HttpError(401, "Admin only");
}
