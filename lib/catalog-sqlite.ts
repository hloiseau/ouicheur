import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { atomic, audit } from "./db.ts";
import { dateNow } from "./validation.ts";
import {
  listDecision,
  purchaseDecision,
  type CatalogList,
  type CatalogStore,
  type ListCommand,
  type PurchaseSnapshot,
} from "./catalog.ts";
import type { Access } from "./lists.ts";

export const catalogListColumns =
  "id,name,description,visibility,archived,event_date,surprise_mode,suggestions_enabled,event_annual,event_timezone,leap_day";
export class SqliteCatalogStore implements CatalogStore {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  getListSync(id: string): CatalogList | undefined {
    return this.db
      .prepare(`SELECT ${catalogListColumns} FROM lists WHERE id=?`)
      .get(id) as CatalogList | undefined;
  }
  saveListSync(value: ListCommand) {
    const db = this.db;
    return atomic(db, () => {
      const id = value.id || randomUUID(),
        existing = this.getListSync(id);
      const decision = listDecision(value, existing),
        row = decision.fields;
      db.prepare(
        `INSERT INTO lists(id,name,description,visibility,archived,event_date,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility=excluded.visibility,archived=excluded.archived,event_date=excluded.event_date`,
      ).run(
        id,
        row.name,
        row.description,
        row.visibility,
        row.archived,
        row.event_date,
        dateNow(),
      );
      db.prepare(
        "UPDATE lists SET surprise_mode=?,suggestions_enabled=?,event_annual=?,event_timezone=?,leap_day=? WHERE id=?",
      ).run(
        row.surprise_mode,
        row.suggestions_enabled,
        row.event_annual,
        row.event_timezone,
        row.leap_day,
        id,
      );
      if (decision.revokeShares)
        db.prepare("UPDATE lists SET share_hash=NULL WHERE id=?").run(id);
      if (decision.resetReveals)
        db.exec("UPDATE sessions SET surprises_revealed=0");
      audit(db, "list.save", id, decision.audit);
      return id;
    });
  }
  setGiftPurchasedSync(id: string, purchased: boolean, access: Access) {
    const db = this.db;
    return atomic(db, () => {
      const gift = db
        .prepare(
          "SELECT g.list_id,g.purchased,l.surprise_mode FROM gifts g JOIN lists l ON l.id=g.list_id WHERE g.id=?",
        )
        .get(id) as PurchaseSnapshot | undefined;
      const decision = purchaseDecision(gift, purchased, access);
      if (decision.changed) {
        db.prepare("UPDATE gifts SET purchased=?,updated_at=? WHERE id=?").run(
          Number(purchased),
          dateNow(),
          id,
        );
        audit(db, "gift.purchase", id, decision.audit);
      }
      return { purchased };
    });
  }
  // No await occurs inside a SQLite transaction. Existing synchronous callers
  // remain compatible while new consumers use the asynchronous store contract.
  async saveList(value: ListCommand) {
    return this.saveListSync(value);
  }
  async getList(id: string) {
    return this.getListSync(id);
  }
  async setGiftPurchased(id: string, purchased: boolean, access: Access) {
    return this.setGiftPurchasedSync(id, purchased, access);
  }
}
