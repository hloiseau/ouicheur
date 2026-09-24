import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./db";
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
    await mkdir(folder, { recursive: true });
    // Content-addressed files are immutable: backups can safely copy referenced images.
    await writeFile(join(folder, name), output, { flag: "wx" }).catch(
      (error) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
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
