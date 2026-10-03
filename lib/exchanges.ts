import { randomInt, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { sessionAccount, rateLimit } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { AppError, dateNow, text, currencySchema } from "./validation.ts";
import { validTimezone } from "./event-dates.ts";
import { eventCalendar } from "./calendar.ts";
const accountKey = z.union([z.literal("owner"), z.uuid()]);
function account(db: DatabaseSync, token: string) {
  const a = sessionAccount(db, token);
  if (!a) throw new AppError("Votre session a expiré. Reconnectez-vous.", 401);
  return a.memberId || "owner";
}
function requireOwner(db: DatabaseSync, token: string) {
  if (account(db, token) !== "owner")
    throw new AppError("Connexion administrateur requise.", 401);
}
function shuffle<T>(values: T[]) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// A randomized bipartite matching finds a feasible assignment without retrying draws.
// It is not claimed to sample all possible matchings uniformly.
export function drawAssignments(
  participants: string[],
  exclusions: [string, string][],
) {
  if (
    participants.length < 2 ||
    participants.length > 50 ||
    new Set(participants).size !== participants.length
  )
    throw new AppError("Choisissez entre 2 et 50 participants différents.");
  const banned = new Set(exclusions.map(([a, b]) => `${a}:${b}`)),
    edges = new Map(
      participants.map((a) => [
        a,
        shuffle(
          participants.filter((b) => a !== b && !banned.has(`${a}:${b}`)),
        ),
      ]),
    ),
    matched = new Map<string, string>();
  function match(giver: string, seen: Set<string>): boolean {
    for (const recipient of edges.get(giver)!) {
      if (seen.has(recipient)) continue;
      seen.add(recipient);
      const previous = matched.get(recipient);
      if (!previous || match(previous, seen)) {
        matched.set(recipient, giver);
        return true;
      }
    }
    return false;
  }
  for (const giver of shuffle(participants))
    if (!match(giver, new Set()))
      throw new AppError(
        "Aucun tirage ne respecte ces exclusions. Modifiez les participants ou les exclusions.",
        409,
      );
  return [...matched].map(([recipient, giver]) => ({ giver, recipient }));
}
export function exchangeAdmin(db: DatabaseSync, token: string) {
  requireOwner(db, token);
  return {
    accounts: [
      {
        id: "owner",
        name: String(
          db.prepare("SELECT name FROM owner WHERE id=1").get()?.name ||
            "Owner",
        ),
      },
      ...db
        .prepare("SELECT id,name FROM members WHERE enabled=1 ORDER BY name,id")
        .all(),
    ],
    events: db
      .prepare(
        "SELECT id,name,event_date,timezone,budget,currency,questions,state,created_at,drawn_at FROM gift_exchanges ORDER BY created_at DESC,id LIMIT 100",
      )
      .all()
      .map((e) => ({
        ...e,
        participants: db
          .prepare(
            "SELECT account_id,name,accepted FROM exchange_participants WHERE exchange_id=? ORDER BY name,account_id",
          )
          .all(e.id),
        exclusions: db
          .prepare(
            "SELECT giver,recipient FROM exchange_exclusions WHERE exchange_id=?",
          )
          .all(e.id),
        reports: db
          .prepare(
            "SELECT id,question,answer FROM exchange_questions WHERE exchange_id=? AND reported=1",
          )
          .all(e.id),
      })),
  };
}
export function createExchange(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  requireOwner(db, token);
  const v = z
    .object({
      name: text(80).min(1),
      event_date: z.iso.date(),
      timezone: text(80).refine(validTimezone).default("Europe/Paris"),
      budget: z.number().int().min(0).max(100000000).nullable().default(null),
      currency: currencySchema,
      participants: z.array(accountKey).min(2).max(50),
      exclusions: z
        .array(z.tuple([accountKey, accountKey]))
        .max(2450)
        .default([]),
      questions: z.boolean().default(false),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    if (
      Number(db.prepare("SELECT COUNT(*) n FROM gift_exchanges").get()!.n) >=
      100
    )
      throw new AppError(
        "Supprimez d’anciens échanges avant d’en créer de nouveaux.",
        409,
      );
    const accounts = exchangeAdmin(db, token).accounts;
    if (
      v.participants.some((id) => !accounts.some((a) => a.id === id)) ||
      v.exclusions.some(
        ([a, b]) =>
          !v.participants.includes(a) || !v.participants.includes(b) || a === b,
      )
    )
      throw new AppError("Participants ou exclusions invalides.");
    drawAssignments(v.participants, v.exclusions); // Feasibility only; nothing is stored or revealed.
    const id = randomUUID();
    db.prepare(
      "INSERT INTO gift_exchanges(id,name,event_date,timezone,budget,currency,questions,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      id,
      v.name,
      v.event_date,
      v.timezone,
      v.budget,
      v.currency,
      Number(v.questions),
      dateNow(),
    );
    for (const a of v.participants)
      db.prepare(
        "INSERT INTO exchange_participants(exchange_id,account_id,name) VALUES (?,?,?)",
      ).run(id, a, String(accounts.find((item) => item.id === a)!.name));
    for (const [a, b] of v.exclusions)
      db.prepare(
        "INSERT OR IGNORE INTO exchange_exclusions VALUES (?,?,?)",
      ).run(id, a, b);
    audit(db, "exchange.create", id);
    return { id };
  });
}
export function manageExchange(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  requireOwner(db, token);
  const v = z
    .object({
      id: z.uuid(),
      action: z.enum(["draw", "cancel", "delete"]),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const e = db
      .prepare("SELECT state FROM gift_exchanges WHERE id=?")
      .get(v.id);
    if (!e) throw new AppError("Échange introuvable.", 404);
    if (v.action === "draw") {
      if (e.state !== "draft")
        throw new AppError(
          "Ce tirage est figé. Annulez l’échange et créez-en un nouveau pour recommencer.",
          409,
        );
      const p = db
        .prepare(
          "SELECT account_id,accepted FROM exchange_participants WHERE exchange_id=?",
        )
        .all(v.id);
      if (
        p.some(
          (r) =>
            !r.accepted ||
            (r.account_id !== "owner" &&
              !db
                .prepare("SELECT 1 FROM members WHERE id=? AND enabled=1")
                .get(r.account_id)),
        )
      )
        throw new AppError(
          "Chaque participant doit accepter l’invitation avec un compte actif avant le tirage.",
          409,
        );
      const exclusions = db
        .prepare(
          "SELECT giver,recipient FROM exchange_exclusions WHERE exchange_id=?",
        )
        .all(v.id)
        .map((r) => [String(r.giver), String(r.recipient)] as [string, string]);
      const pairs = drawAssignments(
        p.map((r) => String(r.account_id)),
        exclusions,
      );
      for (const r of pairs)
        db.prepare("INSERT INTO exchange_assignments VALUES (?,?,?)").run(
          v.id,
          r.giver,
          r.recipient,
        );
      db.prepare(
        "UPDATE gift_exchanges SET state='drawn',drawn_at=? WHERE id=?",
      ).run(dateNow(), v.id);
    } else if (v.action === "delete") {
      if (e.state !== "cancelled")
        throw new AppError("Annulez cet échange avant de le supprimer.", 409);
      db.prepare("DELETE FROM exchange_questions WHERE exchange_id=?").run(
        v.id,
      );
      db.prepare("DELETE FROM exchange_assignments WHERE exchange_id=?").run(
        v.id,
      );
      db.prepare("DELETE FROM exchange_exclusions WHERE exchange_id=?").run(
        v.id,
      );
      db.prepare("DELETE FROM exchange_participants WHERE exchange_id=?").run(
        v.id,
      );
      db.prepare("DELETE FROM gift_exchanges WHERE id=?").run(v.id);
    } else {
      db.prepare("UPDATE gift_exchanges SET state='cancelled' WHERE id=?").run(
        v.id,
      );
      db.prepare("DELETE FROM exchange_assignments WHERE exchange_id=?").run(
        v.id,
      );
      db.prepare("DELETE FROM exchange_questions WHERE exchange_id=?").run(
        v.id,
      );
    }
    db.prepare(
      "DELETE FROM notification_jobs WHERE kind='exchange_reminder' AND list_id=? AND state='pending'",
    ).run(v.id);
    audit(db, `exchange.${v.action}`, v.id);
    return { ok: true };
  });
}
function participant(db: DatabaseSync, id: string, key: string) {
  const r = db
    .prepare(
      "SELECT p.*,e.state,e.questions,e.event_date,e.timezone FROM exchange_participants p JOIN gift_exchanges e ON e.id=p.exchange_id WHERE p.exchange_id=? AND p.account_id=?",
    )
    .get(id, key);
  if (!r) throw new AppError("Échange introuvable.", 404);
  return r;
}
export function myExchanges(db: DatabaseSync, token: string) {
  const key = account(db, token);
  return db
    .prepare(
      "SELECT e.id,e.name,e.event_date,e.timezone,e.budget,e.currency,e.state,e.questions,p.accepted,p.wishes,p.reminders,p.questions_allowed FROM exchange_participants p JOIN gift_exchanges e ON e.id=p.exchange_id WHERE p.account_id=? ORDER BY e.created_at DESC,e.id LIMIT 100",
    )
    .all(key)
    .map((e) => {
      const recipient =
        e.state === "drawn" && e.accepted
          ? db
              .prepare(
                "SELECT p.name,p.wishes,p.questions_allowed FROM exchange_assignments a JOIN exchange_participants p ON p.exchange_id=a.exchange_id AND p.account_id=a.recipient WHERE a.exchange_id=? AND a.giver=?",
              )
              .get(e.id, key)
          : null;
      return {
        ...e,
        recipient: recipient || null,
        sent:
          e.state === "drawn"
            ? db
                .prepare(
                  "SELECT id,question,answer,reported FROM exchange_questions WHERE exchange_id=? AND giver=? ORDER BY created_at,id",
                )
                .all(e.id, key)
            : [],
        inbox:
          e.state === "drawn"
            ? db
                .prepare(
                  "SELECT id,question,answer,reported FROM exchange_questions WHERE exchange_id=? AND recipient=? ORDER BY created_at,id",
                )
                .all(e.id, key)
            : [],
      };
    });
}
export function exchangePreferences(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const key = account(db, token),
    v = z
      .object({
        id: z.uuid(),
        accepted: z.boolean(),
        wishes: text(1000).default(""),
        reminders: z.boolean().default(false),
        questions_allowed: z.boolean().default(false),
      })
      .strict()
      .parse(input);
  atomic(db, () => {
    const p = participant(db, v.id, key);
    if (p.state === "cancelled")
      throw new AppError("Cet échange est annulé.", 409);
    if (p.state === "drawn" && !v.accepted)
      throw new AppError(
        "Le tirage est déjà effectué. Demandez à l’organisateur d’annuler l’échange.",
        409,
      );
    db.prepare(
      "UPDATE exchange_participants SET accepted=?,wishes=?,reminders=?,questions_allowed=? WHERE exchange_id=? AND account_id=?",
    ).run(
      Number(v.accepted),
      v.wishes,
      Number(v.reminders && v.accepted),
      Number(v.questions_allowed && !!p.questions && v.accepted),
      v.id,
      key,
    );
    if (!v.reminders)
      db.prepare(
        "DELETE FROM notification_jobs WHERE kind='exchange_reminder' AND list_id=? AND account_id=? AND state='pending'",
      ).run(v.id, key);
  });
}
export function exchangeQuestion(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const key = account(db, token),
    v = z
      .object({
        exchange_id: z.uuid(),
        action: z.enum(["ask", "answer", "report"]),
        id: z.uuid().optional(),
        message: text(1000).default(""),
      })
      .strict()
      .parse(input);
  rateLimit(db, `exchange-question:${key}`, 20, 3600000);
  atomic(db, () => {
    const p = participant(db, v.exchange_id, key);
    if (p.state !== "drawn" || !p.accepted || !p.questions)
      throw new AppError(
        "Les questions sont indisponibles pour cet échange.",
        409,
      );
    if (v.action === "ask") {
      if (!v.message) throw new AppError("Écrivez une question.");
      const target = db
        .prepare(
          "SELECT a.recipient,p.questions_allowed FROM exchange_assignments a JOIN exchange_participants p ON p.exchange_id=a.exchange_id AND p.account_id=a.recipient WHERE a.exchange_id=? AND a.giver=?",
        )
        .get(v.exchange_id, key);
      if (!target?.questions_allowed)
        throw new AppError("Cette personne n’accepte pas de questions.", 403);
      if (
        Number(
          db
            .prepare(
              "SELECT COUNT(*) n FROM exchange_questions WHERE exchange_id=? AND giver=?",
            )
            .get(v.exchange_id, key)!.n,
        ) >= 10
      )
        throw new AppError("Dix questions au maximum par échange.", 409);
      db.prepare(
        "INSERT INTO exchange_questions(id,exchange_id,giver,recipient,question,created_at) VALUES (?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        v.exchange_id,
        key,
        target.recipient,
        v.message,
        dateNow(),
      );
    } else {
      const q = db
        .prepare(
          "SELECT recipient,reported FROM exchange_questions WHERE id=? AND exchange_id=? AND recipient=?",
        )
        .get(v.id || "", v.exchange_id, key);
      if (!q) throw new AppError("Question introuvable.", 404);
      if (v.action === "report") {
        db.prepare("UPDATE exchange_questions SET reported=1 WHERE id=?").run(
          v.id!,
        );
        db.prepare(
          "UPDATE exchange_participants SET questions_allowed=0 WHERE exchange_id=? AND account_id=?",
        ).run(v.exchange_id, key);
      } else {
        if (q.reported || !v.message)
          throw new AppError(
            "Cette réponse ne peut pas être enregistrée.",
            409,
          );
        db.prepare("UPDATE exchange_questions SET answer=? WHERE id=?").run(
          v.message,
          v.id!,
        );
      }
    }
  });
}
export function exchangeCalendar(
  db: DatabaseSync,
  token: string,
  id: string,
  origin: string,
) {
  const p = participant(db, z.uuid().parse(id), account(db, token));
  if (!p.accepted || p.state === "cancelled")
    throw new AppError("Échange introuvable.", 404);
  return new Response(
    eventCalendar(
      {
        id,
        name: "Ouicheur",
        description: "",
        event_date: String(p.event_date),
        event_timezone: String(p.timezone),
        visibility: "private",
        archived: 0,
        shared: 0,
        surprise_mode: 1,
        suggestions_enabled: 0,
      },
      { include_name: false, include_description: false, include_link: false },
      origin,
    ),
    {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=ouicheur-exchange.ics",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
