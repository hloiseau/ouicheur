import { secretInbox, reviewSecretSuggestion } from "./secret-suggestions.ts";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { rateLimit } from "./auth.ts";
import {
  memberAccess,
  memberSummary,
  requireMember,
  saveMemberGift,
  setMemberGiftPurchased,
} from "./family.ts";
import { listLists } from "./lists.ts";
import { extractMetadata } from "./metadata.ts";
import { downloadImage, storeImage } from "./images.ts";
import { AppError, urlSchema } from "./validation.ts";

const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
export function teamGet(db: DatabaseSync, token: string, path: string) {
  requireMember(db, token);
  if (path === "team/secrets") return json(secretInbox(db, token));
  if (path === "team") return json(memberSummary(db, token));
  if (path === "team/lists") {
    const access = memberAccess(db, token);
    return json(
      listLists(db, access).filter((l) => access.managedLists?.includes(l.id)),
    );
  }
  throw new AppError("Page introuvable.", 404);
}
export async function teamPost(
  db: DatabaseSync,
  token: string,
  path: string,
  input: unknown,
) {
  const account = requireMember(db, token);
  if (path === "team/secrets") {
    reviewSecretSuggestion(db, token, input);
    return json({ ok: true });
  }
  if (path === "team/gifts")
    return json({ id: saveMemberGift(db, token, input) });
  const parts = path.split("/");
  if (parts[1] === "gifts" && parts.length === 3) {
    return json({
      id: saveMemberGift(db, token, input, z.uuid().parse(parts[2])),
    });
  }
  if (parts[1] === "gifts" && parts[3] === "purchased" && parts.length === 4) {
    setMemberGiftPurchased(db, token, z.uuid().parse(parts[2]), input);
    return json({ ok: true });
  }
  if (
    !db
      .prepare(
        "SELECT 1 FROM member_lists ml JOIN lists l ON l.id=ml.list_id WHERE ml.member_id=? AND l.archived=0",
      )
      .get(account.memberId)
  )
    throw new AppError("Aucune liste ne vous est confiée pour le moment.", 403);
  if (path === "team/extract") {
    rateLimit(db, "extract", 20, 60000);
    const v = z.object({ url: urlSchema }).parse(input);
    const result = await extractMetadata(v.url);
    requireMember(db, token);
    return json(result);
  }
  if (path === "team/images") {
    rateLimit(db, "image", 30, 60000);
    const v = z
      .object({
        url: urlSchema.optional(),
        base64: z
          .string()
          .max(7 * 1024 * 1024)
          .optional(),
      })
      .parse(input);
    if (!v.url && !v.base64)
      throw new AppError("Choisissez une image ou un lien.");
    const image = v.url
      ? await downloadImage(v.url)
      : await storeImage(Buffer.from(v.base64!, "base64"));
    requireMember(db, token);
    db.prepare(
      "INSERT OR IGNORE INTO member_uploads(member_id,path) VALUES (?,?)",
    ).run(account.memberId, image);
    return json({ image });
  }
  throw new AppError("Page introuvable.", 404);
}
