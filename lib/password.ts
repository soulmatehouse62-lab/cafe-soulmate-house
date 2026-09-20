// Password hashing with Node's built-in scrypt (memory-hard, no native dependency).
// Stored format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>, so parameters can be raised later
// without breaking existing hashes (see needsRehash).
//
// No "server-only" import: scripts/create-user.ts uses this file under plain Node.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 1 << 15; // CPU/memory cost: 32 MiB per hash with r = 8
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export const PASSWORD_MIN = 10;
/** Upper bound so a huge password can't be used to burn server CPU. */
export const PASSWORD_MAX = 128;

function scrypt(password: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const maxmem = (n: number, r: number) => 256 * n * r; // 2× the 128·N·r scrypt needs

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every(Number.isSafeInteger)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  try {
    const key = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: maxmem(n, r) });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** True when the hash was made with weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const [, n, r, p] = stored.split("$").map(Number);
  return n !== N || r !== R || p !== P;
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "Password must not contain the username";
  if (/^(.)\1+$/.test(password)) return "Password is too simple";
  return null;
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
