import { AppError } from "./validation.ts";
import {
  hashPassword,
  hashToken,
  newSession,
  validSessionToken,
  verifyPassword,
  type SessionRecord,
  type SessionSummary,
} from "./session-credentials.ts";

export type Credential = { accountId: string; passwordHash: string };
type Awaitable<T> = T | Promise<T>;
// Stores revalidate credentials and active sessions atomically at commit time.
// Password derivation runs outside transactions, never while holding DB locks.
export interface SessionStore {
  credential(login: string): Awaitable<Credential | undefined>;
  active(hash: string, now: number): Awaitable<Credential | undefined>;
  login(before: Credential, session: SessionRecord): Awaitable<boolean>;
  change(
    hash: string,
    before: Credential,
    encoded: string,
    session: SessionRecord,
  ): Awaitable<"ok" | "expired" | "changed">;
  list(hash: string, now: number): Awaitable<SessionSummary[]>;
  revoke(
    hash: string,
    target: string,
    now: number,
  ): Awaitable<{ signed_out: boolean }>;
  touch(hash: string, now: number): Awaitable<void>;
}
export function sameCredential(a: Credential | undefined, b: Credential) {
  return (
    !!a && a.accountId === b.accountId && a.passwordHash === b.passwordHash
  );
}
export function requireActive<T>(value: T | undefined): T {
  if (!value)
    throw new AppError("Votre session a expiré. Reconnectez-vous.", 401);
  return value;
}
// Valid encoded work factor for nonexistent accounts; no usable credential.
const dummy = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
export function sessionService(
  store: SessionStore,
  loginMessage = "Connexion impossible. Vérifiez vos identifiants.",
) {
  const tokenHash = (token: string) => {
    requireActive(validSessionToken(token) ? true : undefined);
    return hashToken(token);
  };
  return {
    async login(login: string, password: string, userAgent = "") {
      const before = await store.credential(login);
      const valid = await verifyPassword(
        password,
        before?.passwordHash || dummy,
      );
      if (!before || !valid) throw new AppError(loginMessage, 401);
      const session = newSession(userAgent);
      if (!(await store.login(before, session.record)))
        throw new AppError(loginMessage, 401);
      return session.token;
    },
    async changePassword(
      token: string,
      current: string,
      password: string,
      userAgent = "",
    ) {
      const hash = tokenHash(token);
      const before = requireActive(await store.active(hash, Date.now()));
      if (!(await verifyPassword(current, before.passwordHash)))
        throw new AppError("Mot de passe actuel incorrect.", 403);
      const encoded = await hashPassword(password);
      const session = newSession(userAgent);
      const result = await store.change(hash, before, encoded, session.record);
      if (result === "expired") requireActive(undefined);
      if (result === "changed")
        throw new AppError(
          "Le mot de passe a changé. Reconnectez-vous avant de réessayer.",
          409,
        );
      return session.token;
    },
    async list(token: string) {
      return store.list(tokenHash(token), Date.now());
    },
    async revoke(token: string, target: string) {
      return store.revoke(tokenHash(token), target, Date.now());
    },
    async touch(token: string) {
      return store.touch(tokenHash(token), Date.now());
    },
  };
}
