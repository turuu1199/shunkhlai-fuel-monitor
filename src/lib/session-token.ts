// Edge/Node-compatible signed user-id cookie (Web Crypto only).
export const SESSION_COOKIE = "fm_uid";
export const USER_HEADER = "x-fm-uid";

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

export async function signUserId(uid: string, secret: string): Promise<string> {
  return `${uid}.${await hmac(uid, secret)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function verifyUserId(token: string | undefined, secret: string): Promise<string | null> {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const uid = token.slice(0, i);
  if (!UUID_RE.test(uid)) return null;
  const expected = await hmac(uid, secret);
  const got = token.slice(i + 1);
  if (expected.length !== got.length) return null;
  let diff = 0;
  for (let j = 0; j < got.length; j++) diff |= expected.charCodeAt(j) ^ got.charCodeAt(j);
  return diff === 0 ? uid : null;
}

export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return process.env.NODE_ENV === "production" ? null : "dev-only-insecure-session-secret";
}
