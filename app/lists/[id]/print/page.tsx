import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { database } from "../../../../lib/db";
import { accessFromCookies, listLists } from "../../../../lib/lists";
import { exportedList } from "../../../../lib/list-export";
import { getI18n } from "../../../../lib/i18n-server";
import { variantSummary } from "../../../../lib/wish-details";
import { PrintControls } from "../../../../components/print-controls";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function PrintList({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = database(),
    access = accessFromCookies(db, await cookies()),
    list = listLists(db, access).find((l) => l.id === id);
  if (!list) notFound();
  const data = exportedList(db, id, access),
    { t, money } = await getI18n();
  return (
    <main id="main" className="container print-list">
      <header>
        <p>Ouicheur</p>
        <h1>{data.list.name}</h1>
        <p>{data.list.description}</p>
      </header>
      <PrintControls
        listId={id}
        publicList={list.visibility === "public" && !list.archived}
      />
      <p>
        {t(
          "Les prix sont indicatifs. Vérifiez la liste en ligne avant de réserver ou d’acheter.",
        )}
      </p>
      <div className="print-gifts">
        {data.gifts.map((g) => (
          <article key={g.source_id}>
            {g.image && <img src={g.image} alt="" />}
            <div>
              <h2>{g.title}</h2>
              <p>{g.description}</p>
              {variantSummary(g) && <p>{variantSummary(g)}</p>}
              <p>
                {g.budget_mode === "fixed"
                  ? money(Math.round(Number(g.price) * 100), g.currency)
                  : t(
                      g.budget_mode === "free"
                        ? "Sans dépense nécessaire"
                        : "Budget non précisé",
                    )}{" "}
                · {t("Quantité")} : {g.quantity}
              </p>
              {g.time_hint && <p>{g.time_hint}</p>}
              {g.url && <p className="wrap-code">{g.url}</p>}
              {g.offers.map((o, i) => (
                <p className="wrap-code" key={i}>
                  {t("Offre {0}", i + 1)} : {o.url} — {o.note}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
