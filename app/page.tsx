import { database } from "../lib/db";
import { listGifts, publicProfile } from "../lib/gifts";
import { PublicWishlist } from "../components/public-wishlist";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default function Home() {
  const db = database();
  const profile = publicProfile(db);
  if (!profile) redirect("/setup");
  const gifts = listGifts(db).map(
    ({
      id,
      url,
      title,
      description,
      image,
      target,
      currency,
      category_id,
      category,
      priority,
      purchased,
      closed,
      confirmed,
      unknown_gross,
    }) => ({
      id,
      url,
      title,
      description,
      image,
      target,
      currency,
      category_id,
      category,
      priority,
      purchased,
      closed,
      confirmed,
      unknown_gross,
    }),
  );
  const categories = db
    .prepare("SELECT * FROM categories ORDER BY name")
    .all()
    .map((row) => ({ id: String(row.id), name: String(row.name) }));
  return (
    <PublicWishlist
      profile={profile || null}
      gifts={gifts}
      categories={categories}
    />
  );
}
