"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createI18n, resolveLocale } from "../lib/i18n";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export type Api = <T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  options?: { signal?: AbortSignal },
) => Promise<T>;
export const api: Api = async (path, data, options) => {
  const { t } = createI18n(resolveLocale(document.documentElement.lang));
  const response = await fetch(`/api/${path}`, {
    cache: "no-store",
    signal: options?.signal,
    ...(data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      value.error || t("L’opération a échoué."),
      response.status,
    );
  return value;
};
const Runtime = createContext({ api, href: (path: string) => path });
// Scope transport and navigation to a mounted tree. A host must remount this
// boundary when changing identities/instances, so in-flight views are discarded.
export function RuntimeProvider({
  value,
  children,
}: {
  value: { api: Api; href: (path: string) => string };
  children: ReactNode;
}) {
  return <Runtime.Provider value={value}>{children}</Runtime.Provider>;
}
export const useApi = () => useContext(Runtime).api;
export const useAppHref = () => useContext(Runtime).href;
