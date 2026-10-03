import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { boundedWork } from "./bounded-work.ts";

const resize = boundedWork(2, 32, 10000);
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let bytes = 0;
export const imageWidths = [160, 320, 640, 960, 1600] as const;
export async function responsiveImage(
  folder: string,
  name: string,
  width?: number,
) {
  if (
    !/^[a-f0-9]{64}\.webp$/.test(name) ||
    (width !== undefined && !imageWidths.some((w) => w === width))
  )
    throw Error("Invalid image request");
  if (width === undefined || width === 1600)
    return readFile(join(folder, name));
  const key = `${folder}/${name}/${width}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (pending.has(key)) return pending.get(key)!;
  const work = resize(async () => {
    const source = await readFile(join(folder, name));
    const result = await sharp(source, {
      limitInputPixels: 25000000,
      animated: false,
    })
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    cache.set(key, result);
    bytes += result.length;
    while (bytes > 32 * 1024 * 1024 || cache.size > 128) {
      const oldest = cache.keys().next().value!;
      bytes -= cache.get(oldest)!.length;
      cache.delete(oldest);
    }
    return result;
  });
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
