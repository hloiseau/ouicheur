import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { AppError } from "./validation.ts";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new AppError(
      "Le mot de passe doit contenir entre 12 et 256 caractères.",
    );
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded) ||
    password.length > 256
  )
    return false;
  const [, salt, hex] = encoded.split(":");
  const actual = await derive(password, salt);
  const expected = Buffer.from(hex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export const sessionLifetime = 12 * 60 * 60 * 1000;
// Keep only broad, allowlisted browser/OS families, never the raw User-Agent or IP.
export function sessionDevice(userAgent = "") {
  const ua = userAgent.slice(0, 512);
  const browser = /Edg(?:e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /(?:Firefox|FxiOS)\//.test(ua)
      ? "Firefox"
      : /(?:Chrome|CriOS)\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  const platform = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return [browser, platform].filter(Boolean).join(" · ");
}

export const sessionLimit = 100;
export const validSessionToken = (token: string) =>
  /^[a-f0-9]{64}$/.test(token);
export function newSession(userAgent = "", now = Date.now()) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    record: {
      hash: hashToken(token),
      id: randomBytes(16).toString("hex"),
      created: now,
      seen: now,
      expires: now + sessionLifetime,
      device: sessionDevice(userAgent),
    },
  };
}
export type SessionRecord = ReturnType<typeof newSession>["record"];
export type SessionSummary = {
  id: string;
  current: boolean;
  device: string;
  created_at: string | null;
  last_seen: string | null;
  expires_at: string;
};
export function summarizeSession(
  row: SessionRecord,
  currentHash: string,
): SessionSummary {
  const date = (value: number) =>
    value > 0 ? new Date(value).toISOString() : null;
  return {
    id: row.id,
    current: row.hash === currentHash,
    device: row.device,
    created_at: date(row.created),
    last_seen: date(row.seen),
    expires_at: new Date(row.expires).toISOString(),
  };
}
export function revokeDecision(
  rows: SessionRecord[],
  currentHash: string,
  target: string,
) {
  const matches =
    target === "others"
      ? rows.filter((row) => row.hash !== currentHash)
      : rows.filter((row) => row.id === target);
  if (target !== "others" && !matches.length)
    throw new AppError("Cette session est déjà fermée ou introuvable.", 404);
  return {
    ids: matches.map((row) => row.id),
    signed_out: matches.some((row) => row.hash === currentHash),
  };
}
