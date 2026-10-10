import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "./validation.ts";
const schema = z
  .object({
    version: z.string().length(64),
    offset: z.number().int().min(1).max(10000000),
    expires: z.number().int(),
  })
  .strict();
export const wishlistChanged = () =>
  new AppError(
    "La liste a changé. Actualisez les résultats pour continuer.",
    409,
  );
export const wishlistDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function wishlistCursors(secret: string) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32)
    throw new Error("A shared cursor secret of at least 32 bytes is required");
  return {
    encode(value: z.infer<typeof schema>) {
      const raw = Buffer.from(JSON.stringify(schema.parse(value))).toString(
        "base64url",
      );
      return `${raw}.${createHmac("sha256", secret).update(raw).digest("base64url")}`;
    },
    decode(input: string) {
      try {
        const [raw, mac, ...extra] = input.split(".");
        const expected = createHmac("sha256", secret).update(raw).digest(),
          actual = Buffer.from(mac || "", "base64url");
        if (
          extra.length ||
          expected.length !== actual.length ||
          !timingSafeEqual(expected, actual)
        )
          throw Error();
        const value = schema.parse(
          JSON.parse(Buffer.from(raw, "base64url").toString()),
        );
        if (value.expires <= Date.now() || value.expires > Date.now() + 3601000)
          throw Error();
        return value;
      } catch {
        throw wishlistChanged();
      }
    },
  };
}
