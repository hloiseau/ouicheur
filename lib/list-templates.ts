import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic } from "./db.ts";
import { dateNow, giftSchema, text } from "./validation.ts";
import { saveGiftInTransaction } from "./gifts.ts";
import { createI18n } from "./i18n.ts";
import { listTemplates, templateWishes } from "./list-template-data.ts";
export function createTemplateList(db: DatabaseSync, input: unknown) {
  const v = z
      .object({
        template: z.enum([
          "birthday",
          "christmas",
          "birth",
          "wedding",
          "farewell",
          "housewarming",
          "anytime",
        ]),
        name: text(80).min(1),
        event_date: z.union([z.literal(""), z.iso.date()]).default(""),
        locale: z.enum(["fr", "en"]),
        confirm: z.literal(true),
      })
      .strict()
      .parse(input),
    { t } = createI18n(v.locale);
  return atomic(db, () => {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO lists(id,name,visibility,event_date,created_at) VALUES (?,?,'private',?,?)",
    ).run(id, v.name, v.event_date, dateNow());
    for (const key of listTemplates[v.template].items) {
      const example = templateWishes[key];
      saveGiftInTransaction(
        db,
        giftSchema.parse({
          ...example,
          title: t(example.title),
          description: t(example.description),
          list_id: id,
          url: "",
          visibility: "visible",
        }),
      );
    }
    return { id };
  });
}
