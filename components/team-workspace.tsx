"use client";
import { useEffect, useState } from "react";
import type { Gift } from "../lib/gifts";
import type { Wishlist } from "../lib/lists";
import type { GiftPriority } from "../lib/priority-labels";
import { GiftEditor } from "./admin-gifts";
import { AccountSecurity } from "./account-security";
import { PageHeader } from "./page-header";
import { useI18n } from "./language";
import { api, ApiError, Field, Notice } from "./ui";

type TeamData = {
  account: { name: string; login: string };
  lists: Wishlist[];
  gifts: Gift[];
  categories: { id: string; name: string }[];
  priorities: GiftPriority[];
  currency: string;
  surprises_enabled: boolean;
  surprises_revealed: boolean;
};
export function TeamWorkspace() {
  const { t, money } = useI18n();
  const [data, setData] = useState<TeamData | null>(null);
  const [listId, setListId] = useState("");
  const [security, setSecurity] = useState(false);
  const [editing, setEditing] = useState<Gift | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      const next = await api<TeamData>("team");
      setData(next);
      setListId((id) =>
        next.lists.some((l) => l.id === id) ? id : next.lists[0]?.id || "",
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        window.location.replace("/admin?member=1");
      } else throw e;
    }
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectedList = data?.lists.find((l) => l.id === listId);
  return (
    <>
      <PageHeader>
        <a href="/">{t("Voir la Ouichlist ↗")}</a>
      </PageHeader>
      <main id="main" className="container owner-main team-workspace">
        <header className="admin-header">
          <h1>
            {security ? t("Accès et sécurité") : t("Les listes que je prépare")}
          </h1>
          {data && <p>{t("Connecté en tant que {0}", data.account.name)}</p>}
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setSecurity(!security)}
            >
              {security ? t("Retrouver mes listes") : t("Accès et sécurité")}
            </button>
            <button
              className="text-link"
              onClick={() =>
                void action(async () => {
                  await api("logout", {});
                  window.location.assign("/admin?member=1");
                })
              }
            >
              {t("Déconnexion")}
            </button>
          </div>
        </header>
        {error && (
          <Notice error>
            {error}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void action(refresh)}
            >
              {t("Réessayer")}
            </button>
          </Notice>
        )}
        {!data && !error && <p role="status">{t("Chargement…")}</p>}
        {data &&
          (security ? (
            <AccountSecurity member onChange={refresh} />
          ) : (
            <div className="stack">
              <p>
                {t(
                  "Vous pouvez préparer les envies des listes confiées par le propriétaire. Pour changer leurs accès ou leur partage, contactez-le.",
                )}
              </p>
              {data.surprises_enabled && (
                <section className="panel stack">
                  <h2>{t("Mode surprise")}</h2>
                  <p>
                    {data.surprises_revealed
                      ? t(
                          "Les réservations et les achats sont visibles dans cette session.",
                        )
                      : t(
                          "Les achats et réservations des listes dont vous êtes le destinataire restent masqués.",
                        )}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !data.surprises_revealed &&
                        !window.confirm(
                          t(
                            "Révéler les achats et réservations de vos cadeaux pour cette session ?",
                          ),
                        )
                      )
                        return;
                      void action(() =>
                        api("account/surprises", {
                          reveal: !data.surprises_revealed,
                          confirm: true,
                        }),
                      );
                    }}
                  >
                    {data.surprises_revealed
                      ? t("Masquer mes surprises")
                      : t("Révéler mes surprises")}
                  </button>
                </section>
              )}
              {!data.lists.length ? (
                <Notice>
                  {t("Aucune liste ne vous est confiée pour le moment.")}
                </Notice>
              ) : (
                <>
                  <div className="team-list-toolbar">
                    <Field label={t("Liste à préparer")}>
                      <select
                        value={listId}
                        onChange={(e) => setListId(e.target.value)}
                      >
                        {data.lists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      className="button primary"
                      disabled={busy || !!selectedList?.archived}
                      onClick={() => setEditing("new")}
                    >
                      {t("Ajouter une envie")}
                    </button>
                  </div>
                  {!!selectedList?.archived && (
                    <Notice>{t("Cette liste est archivée.")}</Notice>
                  )}
                  <section
                    className="team-gift-grid"
                    aria-label={t("Envies de cette liste")}
                  >
                    {data.gifts
                      .filter((g) => g.list_id === listId)
                      .map((g) => (
                        <article className="panel stack team-gift" key={g.id}>
                          {g.image && (
                            <img
                              className="team-gift-image"
                              src={g.image}
                              alt=""
                            />
                          )}
                          <h2>{g.title}</h2>
                          <p>{money(g.target, g.currency)}</p>
                          <p>
                            {g.visibility === "archived"
                              ? t("Archivé (privé)")
                              : t("Visible sur ma Ouichlist")}
                          </p>
                          {g.surprise_hidden ? (
                            <Notice>{t("Surprise préservée")}</Notice>
                          ) : (
                            <>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={!!g.purchased}
                                aria-label={t("Cadeau acheté : {0}", g.title)}
                                className="button secondary"
                                disabled={busy || !!selectedList?.archived}
                                onClick={() =>
                                  void action(() =>
                                    api(`team/gifts/${g.id}/purchased`, {
                                      purchased: !g.purchased,
                                    }),
                                  )
                                }
                              >
                                {g.purchased
                                  ? t("Déjà acheté")
                                  : t("Cadeau acheté")}
                              </button>
                              <button
                                className="button secondary"
                                disabled={busy || !!selectedList?.archived}
                                onClick={() => setEditing(g)}
                              >
                                {t("Modifier")}
                              </button>
                            </>
                          )}
                        </article>
                      ))}
                  </section>
                  {!data.gifts.some((g) => g.list_id === listId) && (
                    <p>{t("Cette liste ne contient pas encore d’envie.")}</p>
                  )}
                </>
              )}
            </div>
          ))}
      </main>
      {editing && data && (
        <GiftEditor
          apiPrefix="team"
          gift={editing === "new" ? null : editing}
          priorities={data.priorities}
          categories={data.categories}
          currency={data.currency}
          listId={listId}
          onDone={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void action(refresh);
          }}
        />
      )}
    </>
  );
}
