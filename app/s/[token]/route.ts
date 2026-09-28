import { NextRequest, NextResponse } from "next/server";
import { createI18n, localeCookie, resolveLocale } from "../../../lib/i18n";
import { database } from "../../../lib/db";
import { resolveShare, shareCookie } from "../../../lib/lists";

export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { t } = createI18n(
    resolveLocale(request.cookies.get(localeCookie)?.value),
  );
  const { token } = await params;
  const list = resolveShare(database(), token);
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!list)
    return new NextResponse(t("Ce lien de partage est indisponible."), {
      status: 404,
      headers,
    });
  const reply = new NextResponse(null, {
    status: 303,
    headers: { ...headers, Location: `/lists/${list.id}` },
  });
  reply.cookies.set(shareCookie(String(list.id)), token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      request.nextUrl.protocol === "https:" ||
      (() => {
        try {
          const origin = new URL(process.env.APP_ORIGIN || "");
          return (
            origin.protocol === "https:" &&
            origin.host === request.headers.get("host")
          );
        } catch {
          return false;
        }
      })(),
    path: "/",
    maxAge: 30 * 86400,
  });
  return reply;
}
