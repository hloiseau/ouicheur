import { preferenceLabels } from "./preference-labels.ts";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic } from "./db.ts";
import { canReadList, type Access } from "./lists.ts";
import { AppError, text } from "./validation.ts";
export type Preference = {
  field: keyof typeof preferenceLabels;
  value: string;
  visibility: "shared" | "private";
};
export function sharedPreferences(
  db: DatabaseSync,
  listId: string,
  access: Access,
) {
  if (!canReadList(db, listId, access))
    throw new AppError("Liste introuvable.", 404);
  return db
    .prepare(
      "SELECT field,value,visibility FROM list_preferences WHERE list_id=? AND visibility='shared' ORDER BY field",
    )
    .all(listId) as Preference[];
}
function rights(db: DatabaseSync, listId: string, access: Access) {
  if (!access.owner && !access.managedLists?.includes(listId))
    throw new AppError("Liste introuvable.", 404);
  if (!canReadList(db, listId, access))
    throw new AppError("Liste introuvable.", 404);
  const recipient = access.recipientLists?.includes(listId) ?? access.owner;
  return {
    editable: access.owner || recipient,
    notes: !recipient,
    account: access.memberId || "owner",
  };
}
export function readPreferences(
  db: DatabaseSync,
  listId: string,
  access: Access,
) {
  const r = rights(db, listId, access);
  return {
    editable: r.editable,
    notes_allowed: r.notes,
    fields: r.editable
      ? (db
          .prepare(
            "SELECT field,value,visibility FROM list_preferences WHERE list_id=? ORDER BY field",
          )
          .all(listId) as Preference[])
      : sharedPreferences(db, listId, access),
    note: r.notes
      ? String(
          db
            .prepare(
              "SELECT note FROM organizer_notes WHERE list_id=? AND account_id=?",
            )
            .get(listId, r.account)?.note || "",
        )
      : "",
  };
}
export function savePreferences(
  db: DatabaseSync,
  input: unknown,
  access: Access,
) {
  const v = z
    .object({
      list_id: text(64).min(1),
      fields: z
        .array(
          z
            .object({
              field: z.enum(["interests", "sizes", "colors", "owned", "avoid"]),
              value: text(1000),
              visibility: z.enum(["shared", "private"]),
            })
            .strict(),
        )
        .max(5)
        .optional(),
      note: text(2000).optional(),
    })
    .strict()
    .parse(input);
  atomic(db, () => {
    const r = rights(db, v.list_id, access);
    if (v.fields) {
      if (!r.editable)
        throw new AppError(
          "Seul le destinataire ou le propriétaire peut modifier ces préférences.",
          403,
        );
      if (new Set(v.fields.map((f) => f.field)).size !== v.fields.length)
        throw new AppError("Sélection invalide.");
      db.prepare("DELETE FROM list_preferences WHERE list_id=?").run(v.list_id);
      for (const f of v.fields)
        if (f.value)
          db.prepare("INSERT INTO list_preferences VALUES (?,?,?,?)").run(
            v.list_id,
            f.field,
            f.value,
            f.visibility,
          );
    }
    if (v.note !== undefined) {
      if (!r.notes)
        throw new AppError(
          "Les notes de préparation sont réservées aux organisateurs de cette liste.",
          403,
        );
      db.prepare(
        "DELETE FROM organizer_notes WHERE list_id=? AND account_id=?",
      ).run(v.list_id, r.account);
      if (v.note)
        db.prepare("INSERT INTO organizer_notes VALUES (?,?,?)").run(
          v.list_id,
          r.account,
          v.note,
        );
    }
  });
}
