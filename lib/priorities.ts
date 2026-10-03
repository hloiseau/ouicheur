import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic, audit } from "./db";
import { AppError, text } from "./validation";
import type { GiftPriority } from "./priority-labels";

export function listPriorities(db: DatabaseSync): GiftPriority[] {
  return db
    .prepare(
      "SELECT id,name,position,featured FROM gift_priorities ORDER BY position,id",
    )
    .all() as GiftPriority[];
}
const rowSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  name: text(60).min(1).nullable(),
});
export function savePriorities(db: DatabaseSync, input: unknown) {
  const value = z
    .object({
      priorities: z.array(rowSchema).min(3).max(30),
      featured: z.number().int().nonnegative(),
      previous: z.array(
        z.object({
          id: z.number().int(),
          name: z.string().nullable(),
          position: z.number().int(),
          featured: z.number().int(),
        }),
      ),
    })
    .parse(input);
  return atomic(db, () => {
    const before = listPriorities(db);
    if (JSON.stringify(before) !== JSON.stringify(value.previous))
      throw new AppError(
        "Les priorités ont changé. Rechargez la page avant de réessayer.",
        409,
      );
    const ids = value.priorities.flatMap((p) =>
      p.id === undefined ? [] : [p.id],
    );
    if (
      ids.length !== before.length ||
      new Set(ids).size !== ids.length ||
      before.some((p) => !ids.includes(p.id)) ||
      value.featured >= value.priorities.length
    )
      throw new AppError("Configuration des priorités invalide.");
    if (
      value.priorities.some(
        (p) => p.name === null && (p.id === undefined || p.id > 2),
      )
    )
      throw new AppError("Donnez un nom à chaque priorité.");
    const names = value.priorities
      .filter((p) => p.name !== null)
      .map((p) => p.name!.toLocaleLowerCase());
    if (new Set(names).size !== names.length)
      throw new AppError("Chaque priorité doit avoir un nom différent.");
    db.exec("UPDATE gift_priorities SET featured=0");
    value.priorities.forEach((p, position) => {
      if (p.id === undefined)
        db.prepare(
          "INSERT INTO gift_priorities(name,position,featured) VALUES (?,?,?)",
        ).run(p.name, position, Number(position === value.featured));
      else
        db.prepare(
          "UPDATE gift_priorities SET name=?,position=?,featured=? WHERE id=?",
        ).run(p.name, position, Number(position === value.featured), p.id);
    });
    const after = listPriorities(db);
    audit(db, "priorities.update", "all", { before, after });
    return after;
  });
}
