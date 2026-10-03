import { join } from "node:path";
import { imageWidths, responsiveImage } from "../../../lib/responsive-images";
import { AppError } from "../../../lib/validation";
import { cookies } from "next/headers";
import { accessFromCookies, canReadImage } from "../../../lib/lists";
import { dataDir, database } from "../../../lib/db";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const parameter = new URL(request.url).searchParams.get("w");
  const width = parameter === null ? undefined : Number(parameter);
  if (width !== undefined && !imageWidths.some((w) => w === width))
    return new Response(null, { status: 404 });
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
    const file = await responsiveImage(join(dataDir(), "images"), name, width);
    // Recheck after asynchronous decoding: a share may have been revoked meanwhile.
    if (
      !canReadImage(
        db,
        `/media/${name}`,
        accessFromCookies(db, await cookies()),
      )
    )
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(file.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response(null, {
      status: error instanceof AppError ? error.status : 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
