import type { DatabaseSync } from "node:sqlite";
import type { Access } from "./lists.ts";
import {
  participationAccess,
  type ParticipationGift,
} from "./participation.ts";

export function readParticipationGift(
  db: DatabaseSync,
  id: string,
  access: Access,
) {
  const row = db
    .prepare(
      "SELECT g.*,l.visibility list_visibility,l.archived,l.surprise_mode FROM gifts g JOIN lists l ON l.id=g.list_id WHERE g.id=?",
    )
    .get(id);
  return participationAccess(row as ParticipationGift | undefined, access);
}
