"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "./language";

export type Theme = "system" | "light" | "dark";
const ThemeContext = createContext({
  theme: "system" as Theme,
  ready: false,
  changeTheme: (_theme: Theme) => {},
});

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const changeTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    document.cookie = `ouicheur_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setTheme(next);
  };
  return (
    <ThemeContext.Provider value={{ theme, ready, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeSwitcher() {
  const { theme, ready, changeTheme } = useContext(ThemeContext);
  const { t } = useI18n();
  return (
    <label className="theme-switcher" title={t("Thème")}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
      </svg>
      <select
        aria-label={t("Thème")}
        value={theme}
        disabled={!ready}
        onChange={(event) => changeTheme(event.target.value as Theme)}
      >
        <option value="system">{t("Appareil")}</option>
        <option value="light">{t("Clair")}</option>
        <option value="dark">{t("Sombre")}</option>
      </select>
    </label>
  );
}
