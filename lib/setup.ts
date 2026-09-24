import { randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic } from "./db.ts";
import { hashToken, initializeOwner } from "./auth.ts";
import { AppError, currencySchema, paypalName, text } from "./validation.ts";

// Server startup only. Never serialize this code into an HTTP response.
export function prepareSetup(db: DatabaseSync): string | null {
  return atomic(db, () => {
    if (db.prepare("SELECT 1 FROM owner").get()) return null;
    db.prepare("INSERT OR IGNORE INTO bootstrap(id,code) VALUES (1,?)").run(
      randomBytes(24).toString("base64url"),
    );
    return String(
      db.prepare("SELECT code FROM bootstrap WHERE id=1").get()!.code,
    );
  });
}

export async function completeWebSetup(db: DatabaseSync, input: unknown) {
  if (db.prepare("SELECT 1 FROM owner").get())
    throw new AppError(
      "Cette instance est déjà initialisée. Connectez-vous à votre espace.",
      409,
    );
  const value = z
    .object({
      code: text(256).min(1),
      name: text(80).min(1),
      password: z.string().min(12).max(256),
      confirmation: z.string().max(256),
      currency: currencySchema,
      paypal: text(100).transform(paypalName).default(""),
    })
    .parse(input);
  if (value.password !== value.confirmation)
    throw new AppError("Les mots de passe ne correspondent pas.");
  const bootstrap = db.prepare("SELECT code FROM bootstrap WHERE id=1").get();
  if (
    !bootstrap ||
    !timingSafeEqual(
      Buffer.from(hashToken(value.code), "hex"),
      Buffer.from(hashToken(String(bootstrap.code)), "hex"),
    )
  )
    throw new AppError(
      "Code d’installation incorrect. Retrouvez-le dans les journaux de l’application.",
      403,
    );

  // The owner check, insertion and code deletion share one transaction in
  // initializeOwner, including after the asynchronous password derivation.
  await initializeOwner(db, value.name, value.password, {
    paypal: value.paypal,
    currency: value.currency,
  });
}
