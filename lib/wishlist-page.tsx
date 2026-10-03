import { listPriorities } from "./priorities";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { database } from "./db";
import { listGifts, publicProfile } from "./gifts";
import { accessFromCookies, listLists } from "./lists";
import { PublicWishlist } from "../components/public-wishlist";
import { getI18n } from "./i18n-server";

export async function renderWishlist(listId?: string, preview = false) {
  const db = database();
  const profile = publicProfile(db);
  if (!profile) redirect("/setup");
  const access = accessFromCookies(db, await cookies());
  if (preview) access.owner = false;
  const lists = listLists(db, access);
  if (listId && !lists.some((l) => l.id === listId)) notFound();
  if (!lists.length) {
    const { t } = await getI18n();
    return (
      <main id="main" className="status-page container">
        <h1>Ouicheur</h1>
        <p>{t("Aucune liste publique disponible.")}</p>
        <a href="/admin">{t("Mon espace")}</a>
      </main>
    );
  }
  const gifts = listGifts(db, access.owner, access).filter(
    (g) => !listId || g.list_id === listId,
  );
  const categories = db
    .prepare("SELECT * FROM categories ORDER BY name")
    .all()
    .filter((c) => access.owner || gifts.some((g) => g.category_id === c.id))
    .map((c) => ({
      id: String(c.id),
      name: String(c.name),
      image: String(c.image),
    }));
  return (
    <PublicWishlist
      profile={profile}
      gifts={gifts}
      priorities={listPriorities(db).filter(
        (p) => access.owner || gifts.some((g) => g.priority === p.id),
      )}
      categories={categories}
      lists={listId ? lists.filter((l) => l.id === listId) : lists}
      initialList={listId || ""}
      member={!!access.memberId}
      surprise={
        lists.some(
          (l) =>
            l.surprise_mode &&
            access.recipientLists?.includes(l.id) &&
            (!listId || l.id === listId),
        )
          ? { revealed: !!access.revealSurprises }
          : undefined
      }
      owner={access.owner ? { gifts, currency: profile.currency } : undefined}
    />
  );
}
