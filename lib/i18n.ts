import { productFrench } from "./product-messages.ts";
import { english } from "./messages.ts";
import { formatMoney } from "./format.ts";

export type Locale = "en" | "fr";
export const localeCookie = "ouicheur_locale";
export function resolveLocale(
  preference?: string,
  acceptLanguage?: string | null,
): Locale {
  // Only an explicit choice is persisted. Otherwise follow this request's
  // browser preferences, including regional variants and quality weights.
  if (preference === "fr" || preference === "en") return preference;
  const candidates = (acceptLanguage || "")
    .split(",")
    .flatMap((entry) => {
      const match = entry
        .trim()
        .match(
          /^(fr|en)(?:-[a-z0-9]{1,8})*(?:\s*;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i,
        );
      if (!match) return [];
      const quality = match[2] === undefined ? 1 : Number(match[2]);
      return quality > 0
        ? [{ locale: match[1].toLowerCase() as Locale, quality }]
        : [];
    })
    .sort((a, b) => b.quality - a.quality);
  return candidates[0]?.locale || "en";
}
export function interpolate(
  message: string,
  values: readonly (string | number)[],
) {
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    values[Number(index)] === undefined
      ? placeholder
      : String(values[Number(index)]),
  );
}
export function createI18n(locale: Locale) {
  const t = (message: string, ...values: (string | number)[]) =>
    interpolate(
      locale === "en" && Object.hasOwn(english, message)
        ? english[message]
        : locale === "fr" && Object.hasOwn(productFrench, message)
          ? productFrench[message]
          : message,
      values,
    );
  return {
    locale,
    t,
    money: (amount: number, currency = "EUR") =>
      formatMoney(amount, currency, locale),
    date: (value: string, dateOnly = false) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        ...(dateOnly ? {} : { timeStyle: "short" as const }),
        timeZone: "UTC",
      }).format(new Date(value)) + (dateOnly ? "" : " UTC"),
    storedError: (value: string) => {
      // Imports retain language-neutral messages so history follows the viewer's language.
      try {
        const parts: unknown = JSON.parse(value);
        if (
          Array.isArray(parts) &&
          typeof parts[0] === "string" &&
          parts.every((p) => typeof p === "string" || typeof p === "number")
        )
          return t(parts[0], ...parts.slice(1));
      } catch {
        /* Existing imports stored plain French text. */
      }
      const legacy = value.match(
        /^Source inaccessible \(HTTP (\d+)\)\. Aucun contournement effectué\.$/,
      );
      return legacy
        ? t(
            "Source inaccessible (HTTP {0}). Aucun contournement effectué.",
            legacy[1],
          )
        : t(value);
    },
  };
}
