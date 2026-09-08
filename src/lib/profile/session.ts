import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export const PROFILE_COOKIE = "sanctum_profile";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function secretKey(): Uint8Array {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.PROFILE_SESSION_SECRET ||
        process.env.BETTER_AUTH_SECRET ||
        "")) ||
    "";
  const s = raw.trim() || "sanctum-preview-profile-secret";
  return new TextEncoder().encode(s);
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: typeof process !== "undefined" && process.env.NODE_ENV === "production",
    maxAge,
  };
}

export async function signProfileToken(profileId: string): Promise<string> {
  return new SignJWT({ sub: profileId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function readProfileIdFromToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Current signed-in profile id from the httpOnly cookie, or null. */
export async function getSessionProfileId(): Promise<string | null> {
  const token = getCookie(PROFILE_COOKIE);
  if (!token) return null;
  return readProfileIdFromToken(token);
}

export async function setProfileSession(profileId: string): Promise<void> {
  const token = await signProfileToken(profileId);
  setCookie(PROFILE_COOKIE, token, cookieOpts(MAX_AGE));
}

export function clearProfileSession(): void {
  setCookie(PROFILE_COOKIE, "", cookieOpts(0));
}
