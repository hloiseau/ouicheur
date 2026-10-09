import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db.ts";
import {
  sameCredential,
  requireActive,
  type Credential,
  type SessionStore,
} from "./session-service.ts";
import {
  sessionLimit,
  summarizeSession,
  revokeDecision,
  type SessionRecord,
} from "./session-credentials.ts";

export class SqliteSessionStore implements SessionStore {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  credential(login: string): Credential | undefined {
    if (login === "owner") return this.byId("owner");
    if (!login.startsWith("member:")) return;
    const row = this.db
      .prepare("SELECT id FROM members WHERE login=? AND enabled=1")
      .get(login.slice(7).trim().toLowerCase());
    return row ? this.byId(String(row.id)) : undefined;
  }
  private byId(id: string): Credential | undefined {
    const row =
      id === "owner"
        ? this.db.prepare("SELECT password_hash FROM owner WHERE id=1").get()
        : this.db
            .prepare(
              "SELECT password_hash FROM members WHERE id=? AND enabled=1",
            )
            .get(id);
    return row?.password_hash
      ? { accountId: id, passwordHash: String(row.password_hash) }
      : undefined;
  }
  active(hash: string, now: number) {
    const row = this.db
      .prepare("SELECT member_id FROM sessions WHERE hash=? AND expires>?")
      .get(hash, now);
    return row
      ? this.byId(row.member_id === null ? "owner" : String(row.member_id))
      : undefined;
  }
  // Legacy sessions can precede owner setup; preserve their management facade.
  private account(hash: string, now: number) {
    const row = this.db
      .prepare(
        "SELECT s.member_id FROM sessions s LEFT JOIN members m ON m.id=s.member_id WHERE s.hash=? AND s.expires>? AND (s.member_id IS NULL OR m.enabled=1)",
      )
      .get(hash, now);
    requireActive(row);
    return row!.member_id === null ? null : String(row!.member_id);
  }
  private insert(accountId: string, row: SessionRecord) {
    const member = accountId === "owner" ? null : accountId;
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(row.created);
    this.db
      .prepare(
        "INSERT INTO sessions(hash,expires,id,created_at,last_seen,device,member_id) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        row.hash,
        row.expires,
        row.id,
        row.created,
        row.seen,
        row.device,
        member,
      );
    this.db
      .prepare(
        "DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE member_id IS ? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)",
      )
      .run(member, sessionLimit);
  }
  login(before: Credential, session: SessionRecord) {
    return atomic(this.db, () => {
      if (!sameCredential(this.byId(before.accountId), before)) return false;
      this.insert(before.accountId, session);
      audit(
        this.db,
        before.accountId === "owner" ? "owner.login" : "member.login",
        before.accountId === "owner" ? "1" : before.accountId,
      );
      return true;
    });
  }
  change(
    hash: string,
    before: Credential,
    encoded: string,
    session: SessionRecord,
  ) {
    return atomic(this.db, () => {
      const current = this.active(hash, Date.now());
      if (!current) return "expired" as const;
      if (!sameCredential(current, before)) return "changed" as const;
      const member = before.accountId === "owner" ? null : before.accountId;
      if (member === null)
        this.db
          .prepare("UPDATE owner SET password_hash=? WHERE id=1")
          .run(encoded);
      else
        this.db
          .prepare("UPDATE members SET password_hash=? WHERE id=?")
          .run(encoded, member);
      this.db.prepare("DELETE FROM sessions WHERE member_id IS ?").run(member);
      this.insert(before.accountId, session);
      audit(this.db, "account.password_changed", member || "1");
      return "ok" as const;
    });
  }
  private rows(
    member: string | null,
    now: number,
    hash: string,
  ): SessionRecord[] {
    return this.db
      .prepare(
        "SELECT id,hash,device,created_at,last_seen,expires FROM sessions WHERE member_id IS ? AND expires>? ORDER BY (hash=?) DESC,last_seen DESC,id",
      )
      .all(member, now, hash)
      .map((row) => ({
        id: String(row.id),
        hash: String(row.hash),
        device: String(row.device),
        created: Number(row.created_at),
        seen: Number(row.last_seen),
        expires: Number(row.expires),
      }));
  }
  list(hash: string, now: number) {
    return this.rows(this.account(hash, now), now, hash).map((row) =>
      summarizeSession(row, hash),
    );
  }
  revoke(hash: string, target: string, now: number) {
    return atomic(this.db, () => {
      const member = this.account(hash, now);
      const decision = revokeDecision(
        this.rows(member, now, hash),
        hash,
        target,
      );
      // Revoking "others" also removes expired sessions, as the legacy facade did.
      if (target === "others") {
        const result = this.db
          .prepare("DELETE FROM sessions WHERE hash<>? AND member_id IS ?")
          .run(hash, member);
        audit(this.db, "sessions.revoke_others", member || "1", {
          count: Number(result.changes),
        });
      } else {
        this.db
          .prepare("DELETE FROM sessions WHERE id=? AND member_id IS ?")
          .run(target, member);
        audit(this.db, "session.revoke", target, { actor: member || "1" });
      }
      return { signed_out: decision.signed_out };
    });
  }
  touch(hash: string, now: number) {
    this.db
      .prepare(
        "UPDATE sessions SET last_seen=? WHERE hash=? AND expires>? AND last_seen<?",
      )
      .run(now, hash, now, now - 60000);
  }
}
