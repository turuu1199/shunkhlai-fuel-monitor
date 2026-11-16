import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, USER_HEADER, sessionSecret, signUserId, verifyUserId } from "@/lib/session-token";

/**
 * Gives every browser a signed anonymous user id (no sign-up needed) and forwards the
 * verified id to server code via a request header. Incoming copies of the header are discarded.
 */
export async function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);

  const secret = sessionSecret();
  if (!secret) {
    console.error(JSON.stringify({ level: "error", msg: "SESSION_SECRET missing or too short" }));
    return NextResponse.next({ request: { headers } });
  }

  let uid = await verifyUserId(req.cookies.get(SESSION_COOKIE)?.value, secret);
  const isNew = !uid;
  if (!uid) uid = crypto.randomUUID();
  headers.set(USER_HEADER, uid);

  const res = NextResponse.next({ request: { headers } });
  if (isNew) {
    res.cookies.set(SESSION_COOKIE, await signUserId(uid, secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  }
  return res;
}

export const config = {
  // Machine endpoints (cron, Telegram webhook) and static assets don't need a browser identity.
  matcher: ["/((?!api/cron|api/telegram/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
