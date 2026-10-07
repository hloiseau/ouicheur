"use client";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  createI18n,
  localeCookie,
  resolveLocale,
  type Locale,
} from "../lib/i18n";

const LanguageContext = createContext({
  locale: "en" as Locale,
  pending: false,
  changeLocale: (_locale: Locale) => {},
});
export const useI18n = () => createI18n(useContext(LanguageContext).locale);

export function LanguageSwitcher() {
  const { locale, pending, changeLocale } = useContext(LanguageContext);
  const { t } = useI18n();
  return (
    <label className="language-switcher" title={t("Langue")}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </svg>
      <select
        aria-label={t("Langue")}
        value={locale}
        disabled={pending}
        onChange={(e) => changeLocale(resolveLocale(e.target.value))}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="fr" lang="fr">
          Français
        </option>
      </select>
    </label>
  );
}
export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const changeLocale = (next: Locale) => {
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = next;
    setLocale(next);
    startTransition(() => router.refresh());
  };
  return (
    <LanguageContext.Provider value={{ locale, pending, changeLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}
