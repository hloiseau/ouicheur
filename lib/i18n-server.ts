import { cookies } from "next/headers";
import { createI18n, localeCookie, resolveLocale } from "./i18n";

export async function getI18n() {
  return createI18n(resolveLocale((await cookies()).get(localeCookie)?.value));
}
