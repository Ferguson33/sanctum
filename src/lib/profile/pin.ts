import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** Hash a 4–6 digit PIN for storage. Format: scrypt$<salt_b64>$<key_b64> */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(pin, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Constant-time verify against a stored hashPin() string. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "base64");
    expected = Buffer.from(parts[2], "base64");
  } catch {
    return false;
  }
  if (!salt.length || expected.length !== KEY_LEN) return false;
  const actual = (await scryptAsync(pin, salt, KEY_LEN)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
