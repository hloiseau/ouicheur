import { randomUUID } from "node:crypto";
import { openDatabase } from "../lib/db.ts";
import { initializeOwner } from "../lib/auth.ts";
import { saveList } from "../lib/lists.ts";
import { giftService } from "../lib/gift-persistence.ts";
import { SqliteGiftStore } from "../lib/gift-sqlite.ts";
import { giftContract } from "./gift-contract.ts";
giftContract("SQLite gifts", async () => {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Gifts", "test-gift-password-only");
  return {
    service: giftService(new SqliteGiftStore(db)),
    list: "default",
    async listCreate(surprise = false) {
      return saveList(db, {
        name: "Test",
        visibility: "private",
        surprise_mode: surprise,
      });
    },
    async setCurrency(currency) {
      db.prepare("UPDATE owner SET currency=?").run(currency);
    },
    async seedCategory(id) {
      db.prepare("INSERT INTO categories(id,name) VALUES (?,?)").run(id, id);
    },
    async seedPriority(id) {
      db.prepare(
        "INSERT INTO gift_priorities(id,name,position) VALUES (?,'Custom',3)",
      ).run(id);
    },
    async seedReservation(id, quantity, state, expired) {
      db.prepare(
        "INSERT INTO reservations(id,token_hash,gift_id,quantity,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        randomUUID(),
        id,
        quantity,
        state,
        new Date().toISOString(),
        new Date(Date.now() + (expired ? -1 : 1) * 86400000).toISOString(),
      );
    },
    async seedContribution(id) {
      db.prepare(
        "INSERT INTO contributions(id,gift_id,amount,currency,state,created_at,expires_at) VALUES (?,?,100,'EUR','expired',?,?)",
      ).run(
        randomUUID(),
        id,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    },
    async seedSource(id) {
      db.prepare(
        "UPDATE gifts SET source='test-import',source_id='original' WHERE id=?",
      ).run(id);
    },
    async setPurchased(id) {
      db.prepare("UPDATE gifts SET purchased=1 WHERE id=?").run(id);
    },
    async failAudit() {
      db.exec(
        "CREATE TRIGGER test_gift_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
      );
    },
    async auditCount(id) {
      return Number(
        db.prepare("SELECT count(*) AS n FROM audit WHERE entity_id=?").get(id)!
          .n,
      );
    },
    async close() {
      db.close();
    },
  };
});
