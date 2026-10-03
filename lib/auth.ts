import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db.ts";
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
  const [, salt, hex] = encoded.split(":");
  if (!salt || !hex || password.length > 256) return false;
  const actual = await derive(password, salt);
  const expected = Buffer.from(hex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export async function initializeOwner(
  db: DatabaseSync,
  name: string,
  password: string,
  profile = { paypal: "", currency: "EUR" },
) {
  const encoded = await hashPassword(password);
  if (!name.trim() || name.length > 80)
    throw new AppError("Pseudonyme invalide.");
  atomic(db, () => {
    if (db.prepare("SELECT 1 FROM owner").get())
      throw new AppError("Cette instance est déjà initialisée.", 409);
    db.prepare(
      "INSERT INTO owner(id,name,password_hash,paypal,currency) VALUES (1,?,?,?,?)",
    ).run(name.trim(), encoded, profile.paypal, profile.currency);
    db.exec("DELETE FROM bootstrap");
    audit(db, "owner.initialize", "1");
  });
}
export async function setPassword(db: DatabaseSync, password: string) {
  const encoded = await hashPassword(password);
  atomic(db, () => {
    if (!db.prepare("SELECT 1 FROM owner").get())
      throw new AppError("Initialisez d’abord le propriétaire.");
    db.prepare("UPDATE owner SET password_hash=? WHERE id=1").run(encoded);
    db.exec("DELETE FROM sessions WHERE member_id IS NULL");
    audit(db, "owner.password_changed", "1");
  });
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
export function createSession(
  db: DatabaseSync,
  userAgent = "",
  memberId: string | null = null,
) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
  db.prepare(
    "INSERT INTO sessions(hash,expires,id,created_at,last_seen,device,member_id) VALUES (?,?,?,?,?,?,?)",
  ).run(
    hashToken(token),
    now + sessionLifetime,
    randomBytes(16).toString("hex"),
    now,
    now,
    sessionDevice(userAgent),
    memberId,
  );
  db.prepare(
    "DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE member_id IS ? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 100)",
  ).run(memberId);
  return token;
}
export function authorized(db: DatabaseSync, token?: string) {
  return (
    !!token &&
    /^[a-f0-9]{64}$/.test(token) &&
    !!db
      .prepare(
        "SELECT 1 FROM sessions WHERE hash=? AND expires>? AND member_id IS NULL",
      )
      .get(hashToken(token), Date.now())
  );
}
export type SessionAccount = {
  memberId: string | null;
  role: "owner" | "member";
  name: string;
  login: string;
  revealed: boolean;
};
export function sessionAccount(
  db: DatabaseSync,
  token?: string,
): SessionAccount | undefined {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const row = db
    .prepare(
      "SELECT s.member_id,s.surprises_revealed,m.name,m.login,m.enabled FROM sessions s LEFT JOIN members m ON m.id=s.member_id WHERE s.hash=? AND s.expires>?",
    )
    .get(hashToken(token), Date.now());
  if (!row || (row.member_id !== null && !row.enabled)) return;
  return {
    memberId: row.member_id === null ? null : String(row.member_id),
    role: row.member_id === null ? "owner" : "member",
    name: String(row.name || ""),
    login: String(row.login || ""),
    revealed: !!row.surprises_revealed,
  };
}
export function rateLimit(
  db: DatabaseSync,
  key: string,
  limit: number,
  windowMs: number,
) {
  const allowed = atomic(db, () => {
    const now = Date.now();
    db.prepare("DELETE FROM rate_limits WHERE until < ?").run(now);
    db.prepare(
      "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1",
    ).run(key, now + windowMs);
    const row = db
      .prepare("SELECT hits FROM rate_limits WHERE key=?")
      .get(key)!;
    return Number(row.hits) <= limit;
  });
  if (!allowed)
    throw new AppError("Trop de tentatives. Réessayez un peu plus tard.", 429);
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const source = URL.parse(origin || "");
  const configured = URL.parse(process.env.APP_ORIGIN || "");
  // Next can expose the container's internal URL; Host retains the browser's
  // address and port. Forwarded hosts are never trusted for this comparison.
  const sameOrigin =
    source?.host === request.headers.get("host") &&
    source?.protocol === new URL(request.url).protocol;
  if (
    !source ||
    !["http:", "https:"].includes(source.protocol) ||
    source.origin !== origin ||
    (!sameOrigin && origin !== configured?.origin)
  )
    throw new AppError(
      "Origine de la requête refusée. Rechargez la page ; derrière un proxy, vérifiez APP_ORIGIN.",
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("Format JSON requis.", 415);
}
