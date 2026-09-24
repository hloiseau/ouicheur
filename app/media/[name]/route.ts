import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "../../../lib/db";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!/^[a-f0-9]{64}\.webp$/.test(name))
    return new Response(null, { status: 404 });
  try {
    const file = await readFile(join(dataDir(), "images", name));
    return new Response(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
