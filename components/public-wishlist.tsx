"use client";
import { LanguageSwitcher, useI18n } from "./language";

import type { Wishlist } from "../lib/lists";
import { ShareLink } from "./lists";
import { SurpriseNotice } from "./surprise-notice";
import { SuggestGift } from "./suggestions";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Gift, PublicProfile } from "../lib/gifts";
import { appearanceStyle, defaultAppearance } from "../lib/appearance";
import { ProfileHeader } from "./profile-header";
import { Brand, Icon } from "./ui";
import { GiftEditor } from "./admin-gifts";
import { Categories, type Category } from "./categories";
import { JapanSearch } from "./japan-search";
import {
  filterWishlist,
  parseBudget,
  type BudgetBasis,
  type WishSort,
} from "../lib/wishlist-filters";

export type PublicGift = Pick<
  Gift,
  | "list_id"
  | "reserved"
  | "surprise_hidden"
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
  lists = [],
  initialList = "",
  surprise,
}: {
  surprise?: { revealed: boolean };
  lists?: Wishlist[];
  initialList?: string;
  profile: PublicProfile | null;
  gifts: PublicGift[];
  categories: Category[];
  owner?: { gifts: Gift[]; currency: string };
  embedded?: boolean;
  onRefresh?: () => void;
}) {
  const { t, locale, money, date } = useI18n();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  const router = useRouter();
  const refresh = () => (onRefresh ? onRefresh() : router.refresh());
  const [selectedList, setSelectedList] = useState(initialList);
  const currentList = lists.find((l) => l.id === selectedList);
  const [shown, setShown] = useState(24);
  const [editor, setEditor] = useState<Gift | "new" | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<WishSort>("priority");
  const [basis, setBasis] = useState<BudgetBasis>("unit");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [currency, setCurrency] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [view, setView] = useState("all");
  const resetFilters = () => {
    setView("all");
    setSearch("");
    setCategory("");
    setMinimum("");
    setMaximum("");
    setCurrency("");
    setBasis("unit");
    setAvailableOnly(false);
    setSort("priority");
    setShown(24);
  };
  const countLabel = (count: number) =>
    count === 1 ? t("1 envie") : t("{0} envies", count);
  const completed = (gift: PublicGift) =>
    !!gift.purchased || gift.funded >= gift.target;
  const inList = (gift: PublicGift) =>
    !selectedList || gift.list_id === selectedList;
  const active = (
    owner ? owner.gifts.filter((gift) => gift.visibility !== "archived") : gifts
  ).filter(inList);
  const archived =
    owner?.gifts.filter(
      (gift) => gift.visibility === "archived" && inList(gift),
    ) || [];
  const hasHiddenSurprises = active.some((g) => g.surprise_hidden);
  const safeView = hasHiddenSurprises && view === "completed" ? "all" : view;
  const safeAvailableOnly = availableOnly && !hasHiddenSurprises;
  const scoped = (safeView === "archived" && owner ? archived : active).filter(
    (gift) =>
      safeView === "favorites"
        ? gift.priority === 2
        : safeView === "completed"
          ? completed(gift)
          : true,
  );
  const currencies = [...new Set(gifts.map((gift) => gift.currency))].sort();
  const listCurrencies = [
    ...new Set(gifts.filter(inList).map((gift) => gift.currency)),
  ].sort();
  const defaultCurrency = listCurrencies.includes(profile?.currency || "")
    ? profile!.currency
    : listCurrencies[0] || currencies[0] || "EUR";
  const minAmount = parseBudget(minimum);
  const maxAmount = parseBudget(maximum);
  const budgetError =
    minAmount === undefined || maxAmount === undefined
      ? t(
          "Budget invalide : utilisez un montant entre 0 et 1 000 000, avec deux décimales maximum.",
        )
      : minAmount !== null && maxAmount !== null && minAmount > maxAmount
        ? t("Le budget minimum doit être inférieur ou égal au maximum.")
        : !currency && (minAmount !== null || maxAmount !== null)
          ? t("Choisissez une devise pour filtrer par budget.")
          : "";
  const budgetActive = !!(minimum || maximum || currency || availableOnly);
  const visible = budgetError
    ? []
    : filterWishlist(
        scoped.filter(
          (gift) =>
            (!category || gift.category_id === category) &&
            (!safeAvailableOnly ||
              !lists.find((list) => list.id === gift.list_id)?.archived),
        ),
        {
          search,
          currency,
          basis,
          minimum: minAmount ?? null,
          maximum: maxAmount ?? null,
          availableOnly: safeAvailableOnly,
          sort,
          locale,
        },
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
          <div className="header-actions">
            {owner && (
              <a className="text-link" href="/admin">
                {t("Mon espace")} <Icon name="arrow" size={16} />
              </a>
            )}
            <LanguageSwitcher />
          </div>
        </header>
      )}
      {!embedded && surprise && <SurpriseNotice revealed={surprise.revealed} />}
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
          {lists.length > 0 && (
            <div className="list-toolbar">
              <label>
                {t("Liste")}
                <select
                  value={selectedList}
                  onChange={(e) => {
                    setSelectedList(e.target.value);
                    setShown(24);
                  }}
                >
                  <option value="">{t("Toutes les listes")}</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.archived ? ` · ${t("Archivées")}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedList && (
                <a className="text-link" href={`/lists/${selectedList}`}>
                  {t("Ouvrir cette liste")}
                </a>
              )}
              {owner && (
                <a className="text-link" href="/add">
                  {t("Ajout mobile")}
                </a>
              )}
            </div>
          )}
          {currentList && (
            <section className="list-intro stack">
              <h2>{currentList.name}</h2>
              {currentList.description && <p>{currentList.description}</p>}
              {currentList.event_date && (
                <p>{date(currentList.event_date, true)}</p>
              )}
              {currentList.visibility === "public" &&
                !currentList.archived &&
                origin && (
                  <details>
                    <summary>{t("Partager")}</summary>
                    <ShareLink value={`${origin}/lists/${currentList.id}`} />
                  </details>
                )}
            </section>
          )}
          {!owner && (
            <SuggestGift
              lists={lists.filter(
                (l) =>
                  !!l.suggestions_enabled &&
                  !l.archived &&
                  l.visibility !== "private" &&
                  (!selectedList || l.id === selectedList),
              )}
              initialList={selectedList}
            />
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
                      count: archived.length,
                      icon: "book",
                    },
                  ]
                : []),
            ]
              .filter((item) => !hasHiddenSurprises || item.key !== "completed")
              .map((item) => (
                <button
                  type="button"
                  key={item.key}
                  aria-pressed={safeView === item.key}
                  onClick={() => {
                    setView(item.key);
                    setCategory("");
                    setShown(24);
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
              onSelect={(value) => {
                setCategory(value);
                setShown(24);
              }}
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
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShown(24);
                    }}
                  />
                </label>
                <label className="sort-label">
                  {t("Trier par")}{" "}
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as WishSort);
                      setShown(24);
                    }}
                  >
                    <option value="priority">{t("Coups de cœur")}</option>
                    <option value="price">{t("Objectif croissant")}</option>
                    <option value="price-desc">
                      {t("Objectif décroissant")}
                    </option>
                    <option value="unit-price">
                      {t("Prix unitaire croissant")}
                    </option>
                    <option value="unit-price-desc">
                      {t("Prix unitaire décroissant")}
                    </option>
                    <option value="remaining">
                      {t("Reste à financer croissant")}
                    </option>
                    <option value="title">{t("Nom (A–Z)")}</option>
                    <option value="progress">{t("Financement avancé")}</option>
                  </select>
                </label>
              </div>
              <details className="wishlist-filters">
                <summary>
                  {t("Budget et disponibilité")}
                  {budgetActive && <span>{t("Filtres actifs")}</span>}
                </summary>
                <div className="wishlist-filter-fields">
                  <label>
                    {t("Comparer le budget avec")}
                    <select
                      value={basis}
                      onChange={(e) => {
                        setBasis(e.target.value as BudgetBasis);
                        setShown(24);
                      }}
                    >
                      <option value="unit">{t("Prix d’un exemplaire")}</option>
                      <option value="total">{t("Objectif total")}</option>
                      <option value="remaining">{t("Reste à financer")}</option>
                    </select>
                  </label>
                  <label>
                    {t("Devise du budget")}
                    <select
                      value={currency}
                      onChange={(e) => {
                        setCurrency(e.target.value);
                        setShown(24);
                      }}
                      aria-describedby="wishlist-budget-help"
                    >
                      <option value="">{t("Toutes les devises")}</option>
                      {currencies.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Budget minimum")}
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={12}
                      value={minimum}
                      placeholder="0"
                      aria-invalid={!!budgetError}
                      aria-describedby={
                        budgetError
                          ? "wishlist-budget-error"
                          : "wishlist-budget-help"
                      }
                      onChange={(e) => {
                        setMinimum(e.target.value);
                        if (e.target.value.trim() && !currency)
                          setCurrency(defaultCurrency);
                        setShown(24);
                      }}
                    />
                  </label>
                  <label>
                    {t("Budget maximum")}
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={12}
                      value={maximum}
                      placeholder={t("Sans limite")}
                      aria-invalid={!!budgetError}
                      aria-describedby={
                        budgetError
                          ? "wishlist-budget-error"
                          : "wishlist-budget-help"
                      }
                      onChange={(e) => {
                        setMaximum(e.target.value);
                        if (e.target.value.trim() && !currency)
                          setCurrency(defaultCurrency);
                        setShown(24);
                      }}
                    />
                  </label>
                </div>
                <p id="wishlist-budget-help" className="fine-print">
                  {t(
                    "Le budget porte sur le montant choisi, dans la devise sélectionnée. Les devises ne sont pas converties.",
                  )}
                </p>
                {budgetError && (
                  <p
                    id="wishlist-budget-error"
                    role="alert"
                    className="notice error"
                  >
                    {budgetError}
                  </p>
                )}
                <div className="wishlist-filter-actions">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={safeAvailableOnly}
                      disabled={hasHiddenSurprises}
                      onChange={(e) => {
                        setAvailableOnly(e.target.checked);
                        setShown(24);
                      }}
                    />
                    {t("Encore à offrir uniquement")}
                  </label>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={resetFilters}
                  >
                    {t("Réinitialiser les filtres")}
                  </button>
                </div>
                {hasHiddenSurprises && (
                  <p className="fine-print">
                    {t(
                      "Le filtre de disponibilité et les envies réalisées sont masqués pour préserver la surprise.",
                    )}
                  </p>
                )}
                {safeAvailableOnly && basis === "remaining" && (
                  <p className="fine-print">
                    {t(
                      "Les envies réservées sont exclues : elles ne peuvent pas recevoir de nouvelles contributions.",
                    )}
                  </p>
                )}
              </details>
              {currencies.length > 1 &&
                !currency &&
                [
                  "price",
                  "price-desc",
                  "unit-price",
                  "unit-price-desc",
                  "remaining",
                ].includes(sort) && (
                  <p className="fine-print">
                    {t(
                      "Les montants sont triés séparément dans chaque devise.",
                    )}
                  </p>
                )}
            </>
          )}
          {visible.length ? (
            <div className="gift-grid">
              {visible.slice(0, shown).map((gift) => (
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
                    {gift.surprise_hidden ? (
                      <span className="card-status">
                        {t("Surprise préservée")}
                      </span>
                    ) : gift.purchased ? (
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
                    {gift.reserved !== null && gift.reserved > 0 && (
                      <p className="notice">
                        {gift.reserved === 1
                          ? t("1 exemplaire réservé")
                          : t("{0} exemplaires réservés", gift.reserved)}
                        {owner && (
                          <Link
                            className="text-link reservation-manage"
                            href={`/admin?tab=reservations&gift=${gift.id}`}
                          >
                            {t("Gérer les réservations")}
                          </Link>
                        )}
                      </p>
                    )}
                    <Progress gift={gift} compact />
                    {owner ? (
                      <>
                        <button
                          type="button"
                          className="card-action"
                          disabled={gift.surprise_hidden}
                          onClick={() =>
                            setEditor(
                              owner.gifts.find((g) => g.id === gift.id)!,
                            )
                          }
                        >
                          {gift.surprise_hidden
                            ? t("Révéler avant de modifier")
                            : t("Modifier")}{" "}
                          <Icon name="arrow" size={17} />
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
                        {gift.surprise_hidden ||
                        gift.closed ||
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
                      "Essayez un autre budget, une autre catégorie ou quelques mots différents.",
                    )
                  : t("La liste est vide pour le moment.")}
              </p>
              {gifts.length > 0 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={resetFilters}
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
          {visible.length > shown && (
            <button
              className="button secondary"
              onClick={() => setShown((n) => n + 24)}
            >
              {t("Afficher plus")}
            </button>
          )}
        </section>
      </div>
      {owner && editor && (
        <GiftEditor
          key={editor === "new" ? "new" : editor.id}
          gift={editor === "new" ? null : editor}
          categories={categories}
          currency={owner.currency}
          onCategoriesChanged={refresh}
          categoryId={category || null}
          listId={selectedList || "default"}
          onDone={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            resetFilters();
            refresh();
          }}
        />
      )}
      {!embedded && (
        <>
          <details className="participation-info">
            <summary>{t("À propos des participations")}</summary>
            <p>
              {profile?.strict_contributions
                ? t(
                    "Seules les contributions validées par le propriétaire comptent dans l’objectif.",
                  )
                : t(
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
