"use client";
import { useState } from "react";
import Link from "next/link";
import type { Gift, PublicProfile } from "../lib/gifts";
import { formatMoney } from "../lib/format";
import { Icon } from "./ui";

export type PublicGift = Pick<
  Gift,
  | "id"
  | "url"
  | "title"
  | "description"
  | "image"
  | "target"
  | "currency"
  | "category_id"
  | "category"
  | "priority"
  | "purchased"
  | "closed"
  | "confirmed"
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
  gift: Pick<Gift, "confirmed" | "target" | "currency" | "unknown_gross">;
  compact?: boolean;
}) {
  const percent = Math.min(
    100,
    Math.floor((gift.confirmed / gift.target) * 100),
  );
  return (
    <div className="funding">
      <div className="funding-label">
        <strong>
          {formatMoney(gift.confirmed, gift.currency)}{" "}
          <span>confirmés nets</span>
        </strong>
        <span>
          {compact
            ? `sur ${formatMoney(gift.target, gift.currency)}`
            : `${percent} %`}
        </span>
      </div>
      <progress
        max={gift.target}
        value={Math.min(gift.confirmed, gift.target)}
        aria-label={`${formatMoney(gift.confirmed, gift.currency)} financés sur ${formatMoney(gift.target, gift.currency)}`}
      />
      {!compact && (
        <div className="funding-goal">
          Objectif de {formatMoney(gift.target, gift.currency)}
        </div>
      )}
      {gift.unknown_gross > 0 && (
        <small className="unknown">
          + {formatMoney(gift.unknown_gross, gift.currency)} bruts reçus, frais
          à préciser
        </small>
      )}
    </div>
  );
}
export function PublicWishlist({
  profile,
  gifts,
  categories,
}: {
  profile: PublicProfile | null;
  gifts: PublicGift[];
  categories: { id: string; name: string }[];
}) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [copied, setCopied] = useState(false);
  const socials: string[] = profile ? JSON.parse(profile.socials) : [];
  const visible = gifts
    .filter(
      (g) =>
        (!category || g.category_id === category) &&
        `${g.title} ${g.description}`
          .toLocaleLowerCase("fr")
          .includes(search.toLocaleLowerCase("fr")),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.target - b.target
        : sort === "progress"
          ? b.confirmed / b.target - a.confirmed / a.target
          : b.priority - a.priority,
    );
  return (
    <div className="personal-page container">
      <main id="main">
        <section className="personal-profile">
          {profile?.banner && (
            <img className="profile-banner" src={profile.banner} alt="" />
          )}
          <div className="avatar">
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <span>
                {profile?.name?.slice(0, 1).toUpperCase() || (
                  <Icon name="user" />
                )}
              </span>
            )}
          </div>
          <div className="profile-copy">
            <h1>
              {profile ? `La wishlist de ${profile.name}` : "Ma wishlist"}
            </h1>
            {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
            {socials.length > 0 && (
              <div className="social-links">
                {socials.map((url) => (
                  <a
                    key={url}
                    href={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {new URL(url).hostname.replace(/^www\./, "")} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
          <button
            className="button secondary share-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Icon name="link" size={16} />
            <span>{copied ? "Lien copié !" : "Partager"}</span>
          </button>
        </section>
        <section className="wishlist-section" aria-label="Les envies">
          {gifts.length > 0 && (
            <>
              <div className="wishlist-tools">
                <label className="search-box">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="Rechercher une envie"
                    placeholder="Rechercher"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label className="sort-label">
                  Trier par
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="priority">Coups de cœur</option>
                    <option value="price">Objectif croissant</option>
                    <option value="progress">Financement avancé</option>
                  </select>
                </label>
              </div>
              <div className="category-tabs" aria-label="Filtrer par catégorie">
                <button
                  aria-pressed={!category}
                  className={!category ? "active" : ""}
                  onClick={() => setCategory("")}
                >
                  Tout <span>{gifts.length}</span>
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={category === c.id}
                    className={category === c.id ? "active" : ""}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {visible.length ? (
            <div className="gift-grid">
              {visible.map((gift) => (
                <article className="gift-card" key={gift.id}>
                  <Link
                    href={`/cadeaux/${gift.id}`}
                    className="gift-picture-link"
                    aria-label={`Découvrir ${gift.title}`}
                  >
                    <GiftArt gift={gift} />
                    {gift.priority === 2 && (
                      <span className="card-badge">
                        <Icon name="heart" size={12} />
                        Coup de cœur
                      </span>
                    )}
                    {gift.purchased ? (
                      <span className="card-status">Déjà acheté</span>
                    ) : gift.confirmed >= gift.target ? (
                      <span className="card-status">Objectif atteint</span>
                    ) : null}
                  </Link>
                  <div className="gift-card-body">
                    <h2>
                      <Link href={`/cadeaux/${gift.id}`}>{gift.title}</Link>
                    </h2>
                    <Progress gift={gift} compact />
                    <Link className="card-action" href={`/cadeaux/${gift.id}`}>
                      {gift.closed ||
                      gift.purchased ||
                      gift.confirmed >= gift.target
                        ? "Voir cette envie"
                        : "Participer"}
                      <Icon name="arrow" size={17} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>
                {gifts.length ? "Aucune envie trouvée" : "Pas encore d’envies"}
              </h2>
              <p>
                {gifts.length
                  ? "Essayez une autre catégorie ou quelques mots différents."
                  : "La liste est vide pour le moment."}
              </p>
              {!profile && (
                <a className="text-link" href="/admin">
                  Espace propriétaire <Icon name="arrow" size={16} />
                </a>
              )}
            </div>
          )}
        </section>
      </main>
      <details className="participation-info">
        <summary>À propos des participations</summary>
        <p>
          Choisissez une envie et le montant de votre choix. Le versement se
          fait directement au propriétaire via PayPal.Me ; il vérifie sa
          réception avant de confirmer le financement et achète lui-même le
          cadeau.
        </p>
        <p>
          Wishlister n’ajoute aucune commission. Des frais PayPal peuvent
          s’appliquer. L’argent reçu reste chez le propriétaire même si
          l’objectif n’est pas atteint. Commande, expédition et remboursement ne
          sont pas automatiques.
        </p>
      </details>
      <footer className="personal-footer">
        <span>Wishlister</span>
        <a href="/admin">
          <Icon name="lock" size={14} />
          Mon espace
        </a>
      </footer>
    </div>
  );
}
