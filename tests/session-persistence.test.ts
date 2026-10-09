import { randomUUID } from "node:crypto";
import { openDatabase } from "../lib/db.ts";
import { hashPassword } from "../lib/session-credentials.ts";
import { SqliteSessionStore } from "../lib/session-sqlite.ts";
import { sessionContract, sessionPassword } from "./session-contract.ts";

sessionContract("SQLite sessions", async () => {
  const db = openDatabase(":memory:");
  const encoded = await hashPassword(sessionPassword);
  db.prepare("INSERT INTO owner(id,name,password_hash) VALUES(1,'Test',?)").run(
    encoded,
  );
  const member = randomUUID();
  db.prepare(
    "INSERT INTO members(id,login,name,password_hash,enabled,created_at) VALUES(?, 'relative', 'Relative', ?,1,?)",
  ).run(member, encoded, new Date().toISOString());
  return {
    store: new SqliteSessionStore(db),
    logins: ["owner", "member:relative"],
    async disable() {
      db.prepare("UPDATE members SET enabled=0 WHERE id=?").run(member);
    },
    async reset(login, hash) {
      if (login === "owner")
        db.prepare("UPDATE owner SET password_hash=? WHERE id=1").run(hash);
      else
        db.prepare("UPDATE members SET password_hash=? WHERE id=?").run(
          hash,
          member,
        );
    },
    async expire(hash) {
      db.prepare("UPDATE sessions SET expires=1 WHERE hash=?").run(hash);
    },
    async age(hash) {
      db.prepare("UPDATE sessions SET last_seen=1 WHERE hash=?").run(hash);
    },
    async close() {
      db.close();
    },
  };
});
