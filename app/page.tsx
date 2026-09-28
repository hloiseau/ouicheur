import { renderWishlist } from "../lib/wishlist-page";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  return renderWishlist(undefined, (await searchParams).preview === "1");
}
