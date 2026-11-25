import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kgy_session";
const MAX_AGE_DAYS = 30;

let cachedKeyPromise: Promise<Uint8Array> | null = null;

function secretKey(): Promise<Uint8Array> {
  if (!cachedKeyPromise) {
    const raw =
      process.env.SESSION_SECRET ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      "kgy-local-dev-secret-change-in-production";
    cachedKeyPromise = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`kgy-session-v1:${raw}`))
      .then((buf) => new Uint8Array(buf));
  }
  return cachedKeyPromise;
}

export type SessionPayload = { userId: string };

export async function signSession(payload: SessionPayload) {
  const key = await secretKey();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(key);
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const key = await secretKey();
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return typeof payload.userId === "string" ? { userId: payload.userId } : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
};
