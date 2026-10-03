import type { DatabaseSync } from "node:sqlite";
import { listGifts } from "./gifts.ts";
import { canReadList, listLists, type Access } from "./lists.ts";
import { AppError } from "./validation.ts";
export function exportedList(db: DatabaseSync, id: string, access: Access) {
  if (!canReadList(db, id, access))
    throw new AppError("Liste introuvable.", 404);
  const list = listLists(db, access).find((l) => l.id === id)!;
  const gifts = listGifts(db, false, access)
    .filter((g) => g.list_id === id)
    .map((g) => ({
      source_id: g.id,
      title: g.title,
      description: g.description,
      url: g.url,
      original_url: g.original_url || g.url,
      image: g.image,
      price:
        g.budget_mode === "fixed"
          ? (g.target / g.quantity / 100).toFixed(2)
          : "",
      currency: g.currency,
      quantity: g.quantity,
      kind: g.kind,
      budget_mode: g.budget_mode,
      size: g.size,
      color: g.color,
      model: g.model,
      variant_note: g.variant_note,
      variant_policy: g.variant_policy,
      time_hint: g.time_hint,
      offers: g.offers?.map(({ id: _id, ...o }) => o) || [],
    }));
  return {
    schema: "ouicheur.list",
    version: 1,
    exported_at: new Date().toISOString(),
    list: { name: list.name, description: list.description },
    gifts,
  };
}
// Protect spreadsheet consumers. Quoting by itself does not prevent formulas.
export function csvCell(value: unknown) {
  let s =
    value == null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/^(?:\s*[=+\-@]|[\t\r\n'])/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function listCsv(data: ReturnType<typeof exportedList>) {
  const keys = [
    "source_id",
    "title",
    "description",
    "url",
    "original_url",
    "image",
    "price",
    "currency",
    "quantity",
    "kind",
    "budget_mode",
    "size",
    "color",
    "model",
    "variant_note",
    "variant_policy",
    "time_hint",
    "offers",
  ] as const;
  return (
    "\ufeff" +
    [
      ["_ouicheur_schema", ...keys].map(csvCell).join(","),
      ...data.gifts.map((g) =>
        ["ouicheur.list/1", ...keys.map((k) => g[k])].map(csvCell).join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
export function exportResponse(
  db: DatabaseSync,
  id: string,
  format: string | null,
  access: Access,
) {
  if (!["json", "csv"].includes(format || ""))
    throw new AppError("Format d’export invalide.");
  const data = exportedList(db, id, access);
  return new Response(
    format === "csv" ? listCsv(data) : JSON.stringify(data, null, 2),
    {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ouicheur-list.${format}"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
