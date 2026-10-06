import { openDatabase } from "../lib/db.ts";
import { initializeOwner } from "../lib/auth.ts";
import { saveGift } from "../lib/gifts.ts";
import { catalogService } from "../lib/catalog.ts";
import { SqliteCatalogStore } from "../lib/catalog-sqlite.ts";
import { catalogContract } from "./catalog-contract.ts";

catalogContract("SQLite catalog", async () => {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Catalog test", "catalog-test-only-password");
  return {
    service: catalogService(new SqliteCatalogStore(db)),
    async share(id) {
      return db.prepare("SELECT share_hash FROM lists WHERE id=?").get(id)!
        .share_hash as string | null;
    },
    async seedShare(id) {
      db.prepare(
        "UPDATE lists SET share_hash='test-share-hash' WHERE id=?",
      ).run(id);
    },
    async seedReveal() {
      db.prepare(
        "INSERT INTO sessions(hash,expires,id,surprises_revealed) VALUES ('test-session',9999999999999,'test-session',1) ON CONFLICT(hash) DO UPDATE SET surprises_revealed=1",
      ).run();
    },
    async revealed() {
      return Number(
        db
          .prepare(
            "SELECT surprises_revealed FROM sessions WHERE hash='test-session'",
          )
          .get()!.surprises_revealed,
      );
    },
    async seedGift(list, id) {
      saveGift(
        db,
        {
          list_id: list,
          title: "Fixture",
          url: "https://example.com/fixture",
          target: "10",
        },
        id,
      );
    },
    async purchased(id) {
      return Number(
        db.prepare("SELECT purchased FROM gifts WHERE id=?").get(id)!.purchased,
      );
    },
    async auditCount(action, id) {
      return Number(
        db
          .prepare(
            "SELECT count(*) n FROM audit WHERE action=? AND entity_id=?",
          )
          .get(action, id)!.n,
      );
    },
    async failAudit() {
      db.exec(
        "CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
      );
    },
    async close() {
      db.close();
    },
  };
});
