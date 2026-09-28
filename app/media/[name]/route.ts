import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cookies } from "next/headers";
import { accessFromCookies, canReadImage } from "../../../lib/lists";
import { dataDir, database } from "../../../lib/db";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!/^[a-f0-9]{64}\.webp$/.test(name))
    return new Response(null, { status: 404 });
  const db = database();
  if (
    !canReadImage(db, `/media/${name}`, accessFromCookies(db, await cookies()))
  )
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const file = await readFile(join(dataDir(), "images", name));
    return new Response(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
