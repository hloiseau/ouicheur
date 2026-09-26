import { database } from "../lib/db";
import { listGifts, publicProfile } from "../lib/gifts";
import { PublicWishlist } from "../components/public-wishlist";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authorized } from "../lib/auth";

export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const db = database();
  const profile = publicProfile(db);
  if (!profile) redirect("/setup");
  const isOwner =
    (await searchParams).preview !== "1" &&
    authorized(db, (await cookies()).get("wishlister_session")?.value);
  const owner = isOwner
    ? { gifts: listGifts(db, true), currency: profile.currency }
    : undefined;
  const gifts = listGifts(db).map(
    ({
      id,
      url,
      title,
      description,
      image,
      target,
      quantity,
      currency,
      category_id,
      category,
      priority,
      purchased,
      closed,
      confirmed,
      funded,
      unknown_gross,
    }) => ({
      id,
      url,
      title,
      description,
      image,
      target,
      quantity,
      currency,
      category_id,
      category,
      priority,
      purchased,
      closed,
      confirmed,
      funded,
      unknown_gross,
    }),
  );
  const categories = db
    .prepare("SELECT * FROM categories ORDER BY name")
    .all()
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      image: String(row.image),
    }));
  return (
    <PublicWishlist
      profile={profile || null}
      gifts={gifts}
      categories={categories}
      owner={owner}
    />
  );
}
