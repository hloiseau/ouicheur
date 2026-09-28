import { database } from "../../../lib/db";
import { listLists } from "../../../lib/lists";
import { renderWishlist } from "../../../lib/wishlist-page";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const list = listLists(database()).find((l) => l.id === id);
  return list
    ? {
        title: list.name,
        description: list.description,
        openGraph: {
          title: list.name,
          description: list.description,
          type: "website" as const,
        },
      }
    : { title: "Ouicheur", robots: { index: false, follow: false } };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return renderWishlist((await params).id);
}
