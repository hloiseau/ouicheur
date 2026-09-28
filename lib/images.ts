import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { assertImageSpace } from "./storage";
import { dataDir, database } from "./db";
import { fetchSafe } from "./fetch-safe";
import { AppError } from "./validation";

export async function storeImage(bytes: Buffer) {
  if (bytes.length > 5 * 1024 * 1024)
    throw new AppError("Image limitée à 5 Mo.");
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: 25000000,
      animated: false,
    });
    const metadata = await decoder.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
      throw new AppError("Utilisez une image JPEG, PNG ou WebP.");
    const output = await decoder
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const name = createHash("sha256").update(output).digest("hex") + ".webp";
    const folder = join(dataDir(), "images");
    mkdirSync(folder, { recursive: true });
    const path = join(folder, name);
    if (!existsSync(path)) {
      assertImageSpace(database(), output.length);
      writeFileSync(path, output, { flag: "wx" });
    } else utimesSync(path, new Date(), new Date());
    return `/media/${name}`;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Cette image ne peut pas être décodée en toute sécurité.",
    );
  }
}
export async function downloadImage(url: string) {
  return storeImage((await fetchSafe(url, "image")).body);
}
