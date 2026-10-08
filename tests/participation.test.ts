import { openDatabase } from "../lib/db.ts";
import { initializeOwner } from "../lib/auth.ts";
import { catalogService } from "../lib/catalog.ts";
import { SqliteCatalogStore } from "../lib/catalog-sqlite.ts";
import { giftService } from "../lib/gift-persistence.ts";
import { SqliteGiftStore } from "../lib/gift-sqlite.ts";
import { participationService } from "../lib/participation.ts";
import { SqliteParticipationStore } from "../lib/participation-sqlite.ts";
import { participationContract } from "./participation-contract.ts";
participationContract("SQLite participation", async () => {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Participation", "participation-test-password");
  return {
    service: participationService(new SqliteParticipationStore(db)),
    gifts: giftService(new SqliteGiftStore(db)),
    catalog: catalogService(new SqliteCatalogStore(db)),
    list: "default",
    async settings(v) {
      if (v.paypal !== undefined)
        db.prepare("UPDATE owner SET paypal=?").run(v.paypal);
      if (v.currency !== undefined)
        db.prepare("UPDATE owner SET currency=?").run(v.currency);
      if (v.strict_contributions !== undefined)
        db.prepare("UPDATE owner SET strict_contributions=?").run(
          Number(v.strict_contributions),
        );
    },
    async expire(kind, id) {
      db.prepare(
        `UPDATE ${kind} SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?`,
      ).run(id);
    },
    async failAudit() {
      db.exec(
        "CREATE TRIGGER test_participation_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
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
    async close() {
      db.close();
    },
  };
});
