import { listPriorities, savePriorities } from "../../../lib/priorities";
import {
  changeSessionPassword,
  listSessions,
  loginOwner,
  revokeSessions,
  touchSession,
} from "../../../lib/sessions";
import { productGet, productPost } from "../../../lib/product-api";
import {
  createSuggestion,
  manageSuggestion,
  listSuggestions,
  acceptSuggestion,
  reviewSuggestion,
} from "../../../lib/suggestions";
import {
  accessFromCookies,
  listLists,
  saveList,
  rotateShare,
} from "../../../lib/lists";
import {
  createReservation,
  reservationStatus,
  updateReservation,
} from "../../../lib/reservations";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createI18n, localeCookie, resolveLocale } from "../../../lib/i18n";
import { z } from "zod";
import { database, atomic, audit } from "../../../lib/db";
import {
  authorized,
  createSession,
  hashToken,
  rateLimit,
  requireOrigin,
} from "../../../lib/auth";
import { listGifts, saveGift, setGiftPurchased } from "../../../lib/gifts";
import {
  hiddenSurpriseLists,
  requireSurpriseReveal,
  setSurpriseReveal,
} from "../../../lib/surprise";
import { completeWebSetup } from "../../../lib/setup";
import {
  confirmManual,
  contributionStatus,
  correctPayment,
  createIntent,
  declareIntent,
  expireIntents,
  reviewContribution,
} from "../../../lib/payments";
import {
  AppError,
  currencySchema,
  imageSchema,
  paypalName,
  text,
  urlSchema,
} from "../../../lib/validation";
import { downloadImage, storeImage } from "../../../lib/images";
import { extractMetadata } from "../../../lib/metadata";
import {
  commitImport,
  createImport,
  getImport,
  prepareImport,
  runImport,
} from "../../../lib/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Retain the cookie name so the rename does not sign existing owners out.
const cookieName = "wishlister_session";
const response = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
const authCookie = (
  request: Request,
  reply: NextResponse,
  value: string,
  maxAge = 43200,
) => {
  reply.cookies.set(cookieName, value, {
    httpOnly: true,
    sameSite: "strict",
    // All callers are POST routes whose Origin was validated by requireOrigin.
    secure: request.headers.get("origin")!.startsWith("https://"),
    path: "/",
    maxAge,
  });
  return reply;
};
async function body(request: Request, max = 1024 * 1024) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new AppError("Requête trop volumineuse.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Corps de requête manquant.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError("Requête trop volumineuse.", 413);
    }
    chunks.push(next.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("JSON invalide.");
  }
}
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { t } = createI18n(
    resolveLocale(request.cookies.get(localeCookie)?.value),
  );
  try {
    const segments = (await context.params).path;
    const path = segments.join("/");
    const db = database();
    if (request.method === "GET" && path === "health") {
      db.prepare("SELECT 1").get();
      return response({ status: "ok" });
    }
    if (request.method === "POST") requireOrigin(request);
    const token = request.cookies.get(cookieName)?.value;
    const ip =
      process.env.TRUST_PROXY === "1"
        ? (request.headers.get("x-forwarded-for") || "unknown")
            .split(",")[0]
            .trim()
            .slice(0, 100)
        : "shared";
    if (path === "setup") {
      if (request.method !== "POST")
        throw new AppError("Méthode refusée.", 405);
      if (db.prepare("SELECT 1 FROM owner").get())
        throw new AppError(
          "Cette instance est déjà initialisée. Connectez-vous à votre espace.",
          409,
        );
      rateLimit(db, "setup:global", 10, 15 * 60000);
      await completeWebSetup(db, await body(request, 16 * 1024));
      return authCookie(
        request,
        response({ ok: true }, 201),
        createSession(db, request.headers.get("user-agent") || ""),
      );
    }
    if (path === "login" && request.method === "POST") {
      rateLimit(db, `login:${ip}`, 10, 15 * 60000);
      const value = z
        .object({ password: z.string().min(1).max(256) })
        .parse(await body(request));
      return authCookie(
        request,
        response({ ok: true }),
        await loginOwner(
          db,
          value.password,
          request.headers.get("user-agent") || "",
        ),
      );
    }
    if (path === "contributions" && request.method === "POST") {
      rateLimit(db, `intent:${ip}`, 30, 60 * 60000);
      rateLimit(db, "intent:global", 300, 60 * 60000);
      return response(
        createIntent(
          db,
          await body(request),
          accessFromCookies(db, request.cookies),
        ),
        201,
      );
    }
    if (
      segments[0] === "contributions" &&
      segments.length === 2 &&
      request.method === "GET" &&
      !/^[a-f0-9]{64}$/.test(segments[1] || "")
    )
      throw new AppError("Contribution introuvable.", 404);
    if (
      segments[0] === "contributions" &&
      /^[a-f0-9]{64}$/.test(segments[1] || "")
    ) {
      if (segments.length === 2 && request.method === "GET")
        return response(contributionStatus(db, segments[1]));
      if (
        segments.length === 3 &&
        segments[2] === "declare" &&
        request.method === "POST"
      ) {
        rateLimit(db, `declare:${ip}`, 60, 60 * 60000);
        declareIntent(db, segments[1]);
        return response({ ok: true });
      }
    }
    if (path === "reservations" && request.method === "POST") {
      rateLimit(db, `reservation:${ip}`, 20, 3600000);
      rateLimit(db, "reservation:global", 200, 3600000);
      return response(
        createReservation(
          db,
          await body(request),
          accessFromCookies(db, request.cookies),
        ),
        201,
      );
    }
    if (segments[0] === "reservations" && segments.length === 2) {
      if (request.method === "GET")
        return response(reservationStatus(db, segments[1]));
      if (request.method === "POST") {
        updateReservation(db, segments[1], await body(request));
        return response({ ok: true });
      }
    }
    if (path === "suggestions" && request.method === "POST") {
      rateLimit(db, `suggestion:${ip}`, 10, 3600000);
      rateLimit(db, "suggestion:global", 100, 3600000);
      return response(
        createSuggestion(
          db,
          await body(request, 16 * 1024),
          accessFromCookies(db, request.cookies),
        ),
        201,
      );
    }
    // Management capabilities travel in a JSON body, never in a request URL.
    if (path === "suggestions/manage" && request.method === "POST") {
      rateLimit(db, `suggestion-manage:${ip}`, 120, 3600000);
      rateLimit(db, "suggestion-manage:global", 1000, 3600000);
      return response(manageSuggestion(db, await body(request, 1024)));
    }
    if (!authorized(db, token))
      throw new AppError("Connexion administrateur requise.", 401);
    touchSession(db, token!);
    if (path === "admin/sessions" && request.method === "GET")
      return response(listSessions(db, token!));
    if (path === "admin/sessions/revoke" && request.method === "POST") {
      const v = z
        .object({
          id: z.union([
            z.literal("others"),
            z.string().regex(/^[a-f0-9]{32}$/),
          ]),
          confirm: z.literal(true),
        })
        .parse(await body(request, 1024));
      const result = revokeSessions(db, token!, v.id);
      return result.signed_out
        ? authCookie(request, response(result), "", 0)
        : response(result);
    }
    const access = accessFromCookies(db, request.cookies);
    const hiddenSurprises = hiddenSurpriseLists(db, access);
    if (path === "admin/suggestions" && request.method === "GET")
      return response(
        listSuggestions(db, {
          state: request.nextUrl.searchParams.get("state"),
          page: request.nextUrl.searchParams.get("page"),
        }),
      );
    if (
      segments[0] === "admin" &&
      segments[1] === "suggestions" &&
      segments.length === 4 &&
      request.method === "POST"
    ) {
      const id = z.uuid().parse(segments[2]);
      if (segments[3] === "accept")
        return response({
          id: acceptSuggestion(db, id, await body(request, 16 * 1024)),
        });
      if (segments[3] === "review") {
        reviewSuggestion(db, id, await body(request, 1024));
        return response({ ok: true });
      }
    }
    if (request.method === "GET") {
      const reply = await productGet(db, path, request.nextUrl, access);
      if (reply) return reply;
    }
    if (path === "logout" && request.method === "POST") {
      db.prepare("DELETE FROM sessions WHERE hash=?").run(hashToken(token!));
      return authCookie(request, response({ ok: true }), "", 0);
    }
    if (path === "admin" && request.method === "GET") {
      expireIntents(db);
      return response({
        surprises_enabled: !!db
          .prepare("SELECT 1 FROM lists WHERE surprise_mode=1")
          .get(),
        surprises_revealed: !!access.revealSurprises,
        profile: db
          .prepare(
            "SELECT strict_contributions,name,bio,avatar,banner,socials,paypal,currency,background,accent,banner_position,layout FROM owner WHERE id=1",
          )
          .get(),
        pending_contributions: Number(
          db
            .prepare(
              "SELECT COUNT(*) n FROM contributions c WHERE c.approved=0 AND c.state IN ('declared','detected') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contribution_id=c.id)",
            )
            .get()!.n,
        ),
        pending_suggestions: Number(
          db
            .prepare("SELECT COUNT(*) n FROM suggestions WHERE state='pending'")
            .get()!.n,
        ),
        lists: listLists(db, { owner: true, lists: [] }),
        gifts: listGifts(db, true, access),
        priorities: listPriorities(db),
        categories: db.prepare("SELECT * FROM categories ORDER BY name").all(),
        contributions: db
          .prepare(
            `SELECT c.*,g.title gift_title,p.id payment_id,p.transaction_ref,p.gross,p.fee,p.net,p.refunded,p.net_reversed,p.disputed,p.revision,p.provenance
          FROM contributions c JOIN gifts g ON g.id=c.gift_id LEFT JOIN payments p ON p.contribution_id=c.id ORDER BY c.created_at DESC LIMIT 50`,
          )
          .all(),
        imports: db
          .prepare(
            "SELECT id,source,state,attempts,error,created_at FROM imports ORDER BY created_at DESC LIMIT 50",
          )
          .all(),
        audit: hiddenSurprises.length
          ? []
          : db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100").all(),
      });
    }
    if (path === "admin/lists" && request.method === "GET")
      return response(listLists(db, { owner: true, lists: [] }));
    if (path === "admin/export" && request.method === "GET") {
      requireSurpriseReveal(db, access);
      const data = atomic(db, () => ({
        version: 3,
        priorities: listPriorities(db),
        lists: listLists(db, { owner: true, lists: [] }),
        reservations: db
          .prepare(
            "SELECT id,gift_id,quantity,state,created_at,expires_at FROM reservations",
          )
          .all(),
        suggestions: db
          .prepare(
            "SELECT id,list_id,title,nickname,message,url,state,gift_id,created_at,reviewed_at FROM suggestions",
          )
          .all(),
        exported_at: new Date().toISOString(),
        owner: db
          .prepare(
            "SELECT strict_contributions,name,bio,avatar,banner,socials,paypal,currency,background,accent,banner_position,layout FROM owner WHERE id=1",
          )
          .get(),
        categories: db.prepare("SELECT * FROM categories").all(),
        gifts: db.prepare("SELECT * FROM gifts").all(),
        contributions: db.prepare("SELECT * FROM contributions").all(),
        payments: db.prepare("SELECT * FROM payments").all(),
        payment_events: db.prepare("SELECT * FROM payment_events").all(),
        audit: db.prepare("SELECT * FROM audit").all(),
      }));
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="ouicheur-export.json"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (
      segments[0] === "admin" &&
      segments[1] === "imports" &&
      segments.length === 3 &&
      request.method === "GET"
    ) {
      if (getImport(db, segments[2]).state === "preview")
        await prepareImport(db, segments[2]);
      return response(getImport(db, segments[2]));
    }
    if (request.method !== "POST") throw new AppError("Page introuvable.", 404);
    const data = await body(
      request,
      path === "admin/images" ? 7 * 1024 * 1024 : 1024 * 1024,
    );
    if (path === "admin/surprises") {
      const v = z
        .object({ reveal: z.boolean(), confirm: z.literal(true) })
        .parse(data);
      setSurpriseReveal(db, token!, v.reveal);
      return response({ ok: true });
    }
    if (
      path === "admin/gifts/move" ||
      (path.startsWith("admin/imports/") && path.endsWith("/commit"))
    )
      requireSurpriseReveal(db, access);
    if (
      segments[0] === "admin" &&
      segments[1] === "gifts" &&
      segments.length === 3
    ) {
      const gift = db
        .prepare("SELECT list_id FROM gifts WHERE id=?")
        .get(segments[2]);
      if (gift) requireSurpriseReveal(db, access, String(gift.list_id));
    }
    const productReply = await productPost(db, path, data, access);
    if (productReply) return productReply;
    if (path === "admin/lists") return response({ id: saveList(db, data) });
    if (path === "admin/lists/share") {
      const v = z
        .object({ id: text(64).min(1), revoke: z.boolean().default(false) })
        .parse(data);
      return response({ token: rotateShare(db, v.id, v.revoke) });
    }
    if (path === "admin/strict-contributions") {
      const v = z.object({ enabled: z.boolean() }).parse(data);
      atomic(db, () => {
        db.prepare("UPDATE owner SET strict_contributions=? WHERE id=1").run(
          Number(v.enabled),
        );
        audit(db, "contributions.mode", "1", v);
      });
      return response({ ok: true });
    }
    if (path === "admin/password") {
      rateLimit(db, `password:${ip}`, 5, 15 * 60000);
      const v = z
        .object({ current: z.string().max(256), password: z.string().max(256) })
        .parse(data);
      const replacement = await changeSessionPassword(
        db,
        token!,
        v.current,
        v.password,
        request.headers.get("user-agent") || "",
      );
      return authCookie(request, response({ ok: true }), replacement);
    }
    if (path === "admin/profile") {
      const v = z
        .object({
          name: text(80).min(1),
          bio: text(2000),
          avatar: imageSchema,
          banner: imageSchema,
          background: imageSchema.optional(),
          accent: z
            .string()
            .regex(/^#[a-f\d]{6}$/i)
            .optional(),
          banner_position: z.number().int().min(0).max(100).optional(),
          layout: z.enum(["compact", "comfortable"]).optional(),
          socials: z.array(urlSchema).max(6),
          paypal: text(100).transform(paypalName),
          currency: currencySchema,
        })
        .parse(data);
      atomic(db, () => {
        const before = db
          .prepare("SELECT currency FROM owner WHERE id=1")
          .get()!;
        db.prepare(
          "UPDATE owner SET name=?,bio=?,avatar=?,banner=?,socials=?,paypal=?,currency=?,background=COALESCE(?,background),accent=COALESCE(?,accent),banner_position=COALESCE(?,banner_position),layout=COALESCE(?,layout) WHERE id=1",
        ).run(
          v.name,
          v.bio,
          v.avatar,
          v.banner,
          JSON.stringify(v.socials),
          v.paypal,
          v.currency,
          v.background ?? null,
          v.accent ?? null,
          v.banner_position ?? null,
          v.layout ?? null,
        );
        audit(db, "profile.update", "1", {
          old_currency: before.currency,
          new_currency: v.currency,
        });
      });
      return response({ ok: true });
    }
    if (path === "admin/priorities") return response(savePriorities(db, data));
    if (path === "admin/categories") {
      const v = z
        .object({
          id: z.uuid().optional(),
          name: text(80).min(1),
          image: imageSchema.optional(),
        })
        .parse(data);
      const id = v.id || randomUUID();
      atomic(db, () => {
        db.prepare(
          "INSERT INTO categories(id,name,image) VALUES (?,?,COALESCE(?,'')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,image=COALESCE(?,categories.image)",
        ).run(id, v.name, v.image ?? null, v.image ?? null);
        audit(db, "category.save", id, v);
      });
      return response({ id });
    }
    if (path === "admin/categories/delete") {
      const v = z.object({ id: z.uuid() }).parse(data);
      atomic(db, () => {
        db.prepare("DELETE FROM categories WHERE id=?").run(v.id);
        audit(db, "category.delete", v.id);
      });
      return response({ ok: true });
    }
    if (path === "admin/gifts") return response({ id: saveGift(db, data) });
    if (
      segments[0] === "admin" &&
      segments[1] === "gifts" &&
      segments.length === 4 &&
      segments[3] === "purchased"
    )
      return response(setGiftPurchased(db, segments[2], data, access));
    if (
      segments[0] === "admin" &&
      segments[1] === "gifts" &&
      segments.length === 3
    ) {
      if (!db.prepare("SELECT 1 FROM gifts WHERE id=?").get(segments[2]))
        throw new AppError("Cadeau introuvable.", 404);
      return response({ id: saveGift(db, data, segments[2]) });
    }
    if (path === "admin/confirm")
      return response({ id: confirmManual(db, data) });
    if (path === "admin/contributions/review") {
      reviewContribution(db, data);
      return response({ ok: true });
    }
    if (path === "admin/correct") {
      correctPayment(db, data);
      return response({ ok: true });
    }
    if (path === "admin/contribution-state") {
      const v = z
        .object({
          id: text(64).min(1),
          state: z.enum(["detected", "rejected", "declared"]),
          reason: text(1000).min(5),
        })
        .parse(data);
      atomic(db, () => {
        if (
          db.prepare("SELECT 1 FROM payments WHERE contribution_id=?").get(v.id)
        )
          throw new AppError("Utilisez une correction du versement confirmé.");
        if (
          !db
            .prepare("UPDATE contributions SET state=?,approved=0 WHERE id=?")
            .run(v.state, v.id).changes
        )
          throw new AppError("Contribution introuvable.", 404);
        audit(db, "contribution.state", v.id, v);
      });
      return response({ ok: true });
    }
    if (path === "admin/extract") {
      rateLimit(db, "extract", 20, 60000);
      const v = z.object({ url: urlSchema }).parse(data);
      try {
        return response(await extractMetadata(v.url));
      } catch (error) {
        throw error instanceof AppError
          ? error
          : new AppError(
              "Extraction impossible. Conservez le lien et complétez les champs manuellement.",
            );
      }
    }
    if (path === "admin/images") {
      rateLimit(db, "image", 30, 60000);
      const v = z
        .object({
          url: urlSchema.optional(),
          base64: z
            .string()
            .max(7 * 1024 * 1024)
            .optional(),
        })
        .parse(data);
      if (!v.url && !v.base64)
        throw new AppError("Choisissez une image ou un lien.");
      try {
        return response({
          image: v.url
            ? await downloadImage(v.url)
            : await storeImage(Buffer.from(v.base64!, "base64")),
        });
      } catch (error) {
        throw error instanceof AppError
          ? error
          : new AppError(
              "Téléchargement impossible. Vous pouvez choisir un fichier local.",
            );
      }
    }
    if (path === "admin/imports") {
      rateLimit(db, "imports", 10, 60000);
      const v = z
        .object({
          source: z.enum(["amazon", "throne", "throne-html", "csv", "json"]),
          content: z.string().max(900000),
        })
        .parse(data);
      const id = createImport(db, v.source, v.content);
      if (getImport(db, id).state === "preview") await prepareImport(db, id);
      return response({ id });
    }
    if (
      segments[0] === "admin" &&
      segments[1] === "imports" &&
      segments.length === 4
    ) {
      if (segments[3] === "run") {
        rateLimit(db, "import-run", 10, 60000);
        await runImport(db, segments[2]);
        return response(getImport(db, segments[2]));
      }
      if (segments[3] === "commit")
        return response({ ids: commitImport(db, segments[2], data.selection) });
    }
    throw new AppError("Action inconnue.", 404);
  } catch (error) {
    if (error instanceof AppError)
      return response({ error: t(error.key, ...error.values) }, error.status);
    if (error instanceof z.ZodError)
      return response(
        {
          error: t(
            "Vérifiez les champs : {0}",
            [...new Set(error.issues.map((i) => i.path.join(".")))].join(", "),
          ),
        },
        400,
      );
    if (error instanceof Error && /constraint|UNIQUE/i.test(error.message))
      return response(
        {
          error: t(
            "Une donnée existe déjà ou ne respecte pas les contraintes du registre.",
          ),
        },
        409,
      );
    return response(
      {
        error: t(
          "L’opération a échoué. Vos données confirmées restent conservées.",
        ),
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
