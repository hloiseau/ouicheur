"use client";
import { useI18n } from "./language";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Gift, PublicProfile } from "../lib/gifts";
import { appearanceStyle, defaultAppearance } from "../lib/appearance";
import { ProfileHeader } from "./profile-header";
import { Brand, Icon } from "./ui";
import { GiftEditor } from "./admin-gifts";
import { Categories, type Category } from "./categories";
import { JapanSearch } from "./japan-search";

export type PublicGift = Pick<
  Gift,
  | "id"
  | "url"
  | "title"
  | "description"
  | "image"
  | "target"
  | "quantity"
  | "currency"
  | "category_id"
  | "category"
  | "priority"
  | "purchased"
  | "closed"
  | "funded"
  | "unknown_gross"
>;
export function GiftArt({ gift }: { gift: Pick<Gift, "image" | "title"> }) {
  return (
    <div className="gift-art">
      {gift.image ? (
        <img src={gift.image} alt={gift.title} loading="lazy" />
      ) : (
        <div className="gift-illustration" aria-hidden="true">
          <Icon name="gift" size={38} />
        </div>
      )}
    </div>
  );
}
export function Progress({
  gift,
  compact = false,
}: {
  gift: Pick<Gift, "funded" | "target" | "currency" | "unknown_gross">;
  compact?: boolean;
}) {
  const { t, money } = useI18n();
  const percent = Math.min(100, Math.floor((gift.funded / gift.target) * 100));
  return (
    <div className="funding">
      <div className="funding-label">
        <strong>
          {money(gift.funded, gift.currency)}{" "}
          <span>{t("de participations")}</span>
        </strong>
        <span>{`${percent} %`}</span>
      </div>
      <progress
        max={gift.target}
        value={Math.min(gift.funded, gift.target)}
        aria-label={t(
          "{0} financés sur {1}",
          money(gift.funded, gift.currency),
          money(gift.target, gift.currency),
        )}
      />
      {!compact && (
        <div className="funding-goal">
          {t("Objectif de")} {money(gift.target, gift.currency)}
        </div>
      )}
      {gift.unknown_gross > 0 && (
        <small className="unknown">
          {t("dont")} {money(gift.unknown_gross, gift.currency)}{" "}
          {t("bruts reçus, frais à préciser")}{" "}
        </small>
      )}
    </div>
  );
}
export function PublicWishlist({
  profile,
  gifts,
  categories,
  owner,
  embedded = false,
  onRefresh,
}: {
  profile: PublicProfile | null;
  gifts: PublicGift[];
  categories: Category[];
  owner?: { gifts: Gift[]; currency: string };
  embedded?: boolean;
  onRefresh?: () => void;
}) {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const refresh = () => (onRefresh ? onRefresh() : router.refresh());
  const [editor, setEditor] = useState<Gift | "new" | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [view, setView] = useState("all");
  const countLabel = (count: number) =>
    count === 1 ? t("1 envie") : t("{0} envies", count);
  const completed = (gift: PublicGift) =>
    !!gift.purchased || gift.funded >= gift.target;
  const active = owner
    ? owner.gifts.filter((gift) => gift.visibility !== "archived")
    : gifts;
  const scoped = (
    view === "archived" && owner
      ? owner.gifts.filter((g) => g.visibility === "archived")
      : active
  ).filter((gift) =>
    view === "favorites"
      ? gift.priority === 2
      : view === "completed"
        ? completed(gift)
        : true,
  );
  const visible = scoped
    .filter(
      (g) =>
        (!category || g.category_id === category) &&
        `${g.title} ${g.description}`
          .toLocaleLowerCase(locale)
          .includes(search.toLocaleLowerCase(locale)),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.target - b.target
        : sort === "progress"
          ? b.funded / b.target - a.funded / a.target
          : b.priority - a.priority,
    );
  return (
    <div
      id={embedded ? undefined : "main"}
      role={embedded ? undefined : "main"}
      className={
        embedded ? "personal-page owner-wishlist" : "personal-page container"
      }
      style={appearanceStyle(profile || defaultAppearance)}
      data-layout={profile?.layout || "compact"}
    >
      {!embedded && (
        <header className="public-masthead">
          <Brand />
          {owner && (
            <a className="text-link" href="/admin">
              {t("Mon espace")} <Icon name="arrow" size={16} />
            </a>
          )}
        </header>
      )}
      {!embedded && profile?.background && (
        <div
          className="profile-backdrop"
          aria-hidden="true"
          style={{ backgroundImage: `url("${profile.background}")` }}
        />
      )}
      <div>
        {!embedded && (
          <ProfileHeader
            profile={
              profile || {
                name: t("Ma Ouichlist"),
                bio: "",
                avatar: "",
                banner: "",
                banner_position: 50,
                socials: "[]",
              }
            }
          />
        )}
        <section className="wishlist-section" aria-label={t("Les envies")}>
          {owner && (
            <div className="owner-actions">
              <div>
                {embedded ? (
                  <h1>{t("Mes envies")}</h1>
                ) : (
                  <strong>{t("Mes envies")}</strong>
                )}
              </div>
              <button
                className="button primary"
                onClick={() => setEditor("new")}
              >
                <Icon name="plus" size={18} />
                {t("Ajouter une envie")}
              </button>
            </div>
          )}
          <div
            className="wishlist-navigation"
            aria-label={t("Afficher les envies")}
          >
            {[
              {
                key: "all",
                label: t("Ma Ouichlist"),
                count: active.length,
                icon: "gift",
              },
              {
                key: "favorites",
                label: t("Coups de cœur"),
                count: active.filter((g) => g.priority === 2).length,
                icon: "heart",
              },
              {
                key: "completed",
                label: t("Envies réalisées"),
                count: active.filter(completed).length,
                icon: "check",
              },
              ...(owner
                ? [
                    {
                      key: "archived",
                      label: t("Archivées"),
                      count: owner.gifts.filter(
                        (g) => g.visibility === "archived",
                      ).length,
                      icon: "book",
                    },
                  ]
                : []),
            ].map((item) => (
              <button
                type="button"
                key={item.key}
                aria-pressed={view === item.key}
                onClick={() => {
                  setView(item.key);
                  setCategory("");
                }}
              >
                <Icon name={item.icon} size={17} />
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          {(owner || categories.length > 0) && (
            <Categories
              categories={categories}
              gifts={scoped}
              selected={category}
              onSelect={setCategory}
              editable={!!owner}
              onSaved={refresh}
            />
          )}
          {gifts.length > 0 && (
            <>
              <div className="wishlist-tools">
                <span className="results-count" role="status">
                  {countLabel(visible.length)}
                </span>
                <label className="search-box">
                  <Icon name="search" size={18} />
                  <input
                    aria-label={t("Rechercher une envie")}
                    placeholder={t("Rechercher")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label className="sort-label">
                  {t("Trier par")}{" "}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="priority">{t("Coups de cœur")}</option>
                    <option value="price">{t("Objectif croissant")}</option>
                    <option value="progress">{t("Financement avancé")}</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {visible.length ? (
            <div className="gift-grid">
              {visible.map((gift) => (
                <article
                  className={`gift-card${owner ? " admin-gift-row" : ""}`}
                  key={gift.id}
                >
                  <Link
                    href={`/cadeaux/${gift.id}`}
                    className="gift-picture-link"
                    aria-label={t("Découvrir {0}", gift.title)}
                  >
                    <GiftArt gift={gift} />
                    {gift.priority === 2 && (
                      <span className="card-badge">
                        <Icon name="heart" size={12} />
                        {t("Coup de cœur")}{" "}
                      </span>
                    )}
                    {gift.purchased ? (
                      <span className="card-status">{t("Déjà acheté")}</span>
                    ) : gift.funded >= gift.target ? (
                      <span className="card-status">
                        {t("Objectif atteint")}
                      </span>
                    ) : null}
                  </Link>
                  <div className="gift-card-body">
                    {gift.category && (
                      <span className="gift-category">{gift.category}</span>
                    )}
                    <h2>
                      <Link href={`/cadeaux/${gift.id}`}>{gift.title}</Link>
                    </h2>
                    {gift.description && (
                      <p className="gift-description">{gift.description}</p>
                    )}
                    <div className="gift-price">
                      <strong>{money(gift.target, gift.currency)}</strong>
                      <span>{t("Objectif à financer")}</span>
                    </div>
                    {gift.quantity > 1 && (
                      <p className="fine-print">
                        {t(
                          "Quantité : {0} × {1}",
                          gift.quantity,
                          money(gift.target / gift.quantity, gift.currency),
                        )}
                      </p>
                    )}
                    <Progress gift={gift} compact />
                    {owner ? (
                      <>
                        <button
                          type="button"
                          className="card-action"
                          onClick={() =>
                            setEditor(
                              owner.gifts.find((g) => g.id === gift.id)!,
                            )
                          }
                        >
                          {t("Modifier")} <Icon name="arrow" size={17} />
                        </button>
                        {(() => {
                          const g = owner.gifts.find((g) => g.id === gift.id);
                          return g && <JapanSearch {...g} />;
                        })()}
                      </>
                    ) : (
                      <Link
                        className="card-action"
                        href={`/cadeaux/${gift.id}`}
                      >
                        {gift.closed ||
                        gift.purchased ||
                        gift.funded >= gift.target
                          ? t("Voir cette envie")
                          : t("Participer")}
                        <Icon name="arrow" size={17} />
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>
                {gifts.length
                  ? t("Aucune envie trouvée")
                  : t("Pas encore d’envies")}
              </h2>
              <p>
                {gifts.length
                  ? t(
                      "Essayez une autre catégorie ou quelques mots différents.",
                    )
                  : t("La liste est vide pour le moment.")}
              </p>
              {gifts.length > 0 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setView("all");
                    setSearch("");
                    setCategory("");
                  }}
                >
                  {t("Réinitialiser les filtres")}
                </button>
              )}
              {!profile && (
                <a className="text-link" href="/admin">
                  {t("Espace propriétaire")} <Icon name="arrow" size={16} />
                </a>
              )}
            </div>
          )}
        </section>
      </div>
      {owner && editor && (
        <GiftEditor
          key={editor === "new" ? "new" : editor.id}
          gift={editor === "new" ? null : editor}
          categories={categories}
          currency={owner.currency}
          categoryId={category || null}
          onDone={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setSearch("");
            setView("all");
            setCategory("");
            refresh();
          }}
        />
      )}
      {!embedded && (
        <>
          <details className="participation-info">
            <summary>{t("À propos des participations")}</summary>
            <p>
              {t(
                "Choisissez une envie et votre montant, puis envoyez votre participation via PayPal. Elle compte dès que vous indiquez l’avoir envoyée. Le propriétaire achète lui-même le cadeau.",
              )}{" "}
            </p>
            <p>
              {t(
                "Ouicheur n’ajoute aucune commission. Des frais PayPal peuvent s’appliquer. L’argent reçu reste chez le propriétaire même si l’objectif n’est pas atteint. Commande, expédition et remboursement ne sont pas automatiques.",
              )}{" "}
            </p>
          </details>
          <footer className="personal-footer">
            <span>Ouicheur</span>
            <a href="/admin">
              <Icon name="lock" size={14} />
              {t("Mon espace")}{" "}
            </a>
          </footer>
        </>
      )}
    </div>
  );
}
