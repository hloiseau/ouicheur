import type { DatabaseSync } from "node:sqlite";
import { hashToken, validSessionToken } from "./session-credentials.ts";
import { requireActive, sessionService } from "./session-service.ts";
import { SqliteSessionStore } from "./session-sqlite.ts";
export type { SessionSummary } from "./session-credentials.ts";

function checkedHash(token: string) {
  requireActive(validSessionToken(token) ? true : undefined);
  return hashToken(token);
}
// Synchronous compatibility for existing rendering and internal callers.
export function touchSession(db: DatabaseSync, token: string) {
  new SqliteSessionStore(db).touch(hashToken(token), Date.now());
}
export function listSessions(db: DatabaseSync, token: string) {
  return new SqliteSessionStore(db).list(checkedHash(token), Date.now());
}
export function revokeSessions(
  db: DatabaseSync,
  token: string,
  target: string,
) {
  return new SqliteSessionStore(db).revoke(
    checkedHash(token),
    target,
    Date.now(),
  );
}
export async function loginOwner(
  db: DatabaseSync,
  password: string,
  userAgent = "",
) {
  return sessionService(
    new SqliteSessionStore(db),
    "Connexion impossible. Vérifiez le mot de passe.",
  ).login("owner", password, userAgent);
}
export async function changeSessionPassword(
  db: DatabaseSync,
  token: string,
  current: string,
  password: string,
  userAgent = "",
) {
  return sessionService(new SqliteSessionStore(db)).changePassword(
    token,
    current,
    password,
    userAgent,
  );
}
