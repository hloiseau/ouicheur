"use client";
import { useState } from "react";
import Link from "next/link";
import type { Gift, PublicProfile } from "../lib/gifts";
import { formatMoney } from "../lib/format";
import { Brand, Icon } from "./ui";

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
export function GiftArt({
  gift,
  index = 0,
}: {
  gift: Pick<Gift, "image" | "title">;
  index?: number;
}) {
  return (
    <div className={`gift-art tone-${index % 4}`}>
      {gift.image ? (
        <img src={gift.image} alt={gift.title} loading="lazy" />
      ) : (
        <div className="gift-illustration" aria-hidden="true">
          <span className="art-orbit" />
          <Icon
            name={
              index % 3 === 0 ? "gift" : index % 3 === 1 ? "heart" : "spark"
            }
            size={76}
          />
        </div>
      )}
    </div>
  );
}
export function Progress({
  gift,
}: {
  gift: Pick<Gift, "confirmed" | "target" | "currency" | "unknown_gross">;
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
        <span>{percent} %</span>
      </div>
      <progress
        max={gift.target}
        value={Math.min(gift.confirmed, gift.target)}
        aria-label={`${formatMoney(gift.confirmed, gift.currency)} financés sur ${formatMoney(gift.target, gift.currency)}`}
      />
      <div className="funding-goal">
        Objectif de {formatMoney(gift.target, gift.currency)}
      </div>
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
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav aria-label="Navigation principale">
            <a href="#envies" className="nav-active">
              La wishlist
            </a>
            <a href="#comment">Comment ça marche</a>
          </nav>
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
            {copied ? "Lien copié !" : "Partager"}
          </button>
        </div>
      </header>
      <main id="main">
        <section
          className={`profile-hero ${profile?.banner ? "has-banner" : ""}`}
        >
          {profile?.banner && (
            <img className="profile-banner" src={profile.banner} alt="" />
          )}
          <div className="container hero-inner">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="tiny-dot" />
                Wishlist personnelle · À partager
              </div>
              <div className="profile-heading">
                <div className="profile-intro">
                  <div className="avatar">
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt="" />
                    ) : (
                      <span>
                        {profile?.name?.slice(0, 1).toUpperCase() || (
                          <Icon name="heart" size={32} />
                        )}
                      </span>
                    )}
                  </div>
                  <p className="greeting">Des envies qui me ressemblent.</p>
                </div>
                <h1>
                  La wishlist de{" "}
                  <em>
                    {profile?.name || "demain"}
                    <span className="heading-dot">.</span>
                  </em>
                </h1>
              </div>
              <p className="hero-description">
                {profile?.bio ||
                  (profile
                    ? "Des objets, des idées, des projets. Retrouvez mes envies du moment et participez à celles qui vous parlent."
                    : "Des objets, des idées, des projets. La sélection se prépare : les premières envies arrivent bientôt.")}
              </p>
              <div className="hero-bottom">
                <span className="soft-tag">
                  <Icon name="gift" size={16} />
                  {gifts.length} envie{gifts.length > 1 ? "s" : ""} à partager
                </span>
                <span className="soft-tag">
                  <Icon name="heart" size={16} />
                  Libre à vous de participer
                </span>
              </div>
              {profile && JSON.parse(profile.socials).length > 0 && (
                <div className="social-links">
                  {(JSON.parse(profile.socials) as string[]).map((url) => (
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
            <div className="hero-art" aria-hidden="true">
              <div className="wish-pass">
                <span className="pass-label">Une idée devient réelle.</span>
                <div className="pass-symbol">
                  <Icon name="gift" size={110} />
                </div>
                <div className="pass-footer">
                  <strong>{String(gifts.length).padStart(2, "0")}</strong>
                  <span>
                    Envies
                    <br />à partager
                  </span>
                  <Icon name="arrow" size={27} />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="container wishlist-section" id="envies">
          <div className="section-heading">
            <div>
              <span className="eyebrow">La sélection</span>
              <h2>
                Mes envies du moment
                <span className="heading-dot">.</span>
              </h2>
            </div>
            <label className="sort-label">
              Trier par
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="priority">Mes coups de cœur</option>
                <option value="price">Objectif croissant</option>
                <option value="progress">Financement avancé</option>
              </select>
            </label>
          </div>
          <div className="filter-row">
            <div className="category-tabs" aria-label="Filtrer par catégorie">
              <button
                aria-pressed={!category}
                className={!category ? "active" : ""}
                onClick={() => setCategory("")}
              >
                Toutes les envies <span>{gifts.length}</span>
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
            <label className="search-box">
              <Icon name="search" size={18} />
              <input
                aria-label="Rechercher une envie"
                placeholder="Une envie en tête ?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {visible.length ? (
            <div className="gift-grid">
              {visible.map((gift, index) => (
                <article className="gift-card" key={gift.id}>
                  <Link
                    href={`/cadeaux/${gift.id}`}
                    className="gift-picture-link"
                    aria-label={`Découvrir ${gift.title}`}
                  >
                    <GiftArt gift={gift} index={index} />
                    {gift.priority === 2 && (
                      <span className="card-badge">
                        <Icon name="heart" size={12} />
                        Coup de cœur
                      </span>
                    )}
                    {gift.purchased ? (
                      <span className="card-status">Déjà acheté</span>
                    ) : gift.confirmed >= gift.target ? (
                      <span className="card-status">Objectif atteint ✨</span>
                    ) : null}
                  </Link>
                  <div className="gift-card-body">
                    <span className="card-category">
                      {gift.category || "Mes envies"}
                    </span>
                    <h3>
                      <Link href={`/cadeaux/${gift.id}`}>{gift.title}</Link>
                    </h3>
                    <p className="card-description">
                      {gift.description ||
                        "Une envie à concrétiser, à mon rythme."}
                    </p>
                    <Progress gift={gift} />
                    <Link
                      className={`button ${gift.closed || gift.purchased || gift.confirmed >= gift.target ? "secondary" : "primary"} card-action`}
                      href={`/cadeaux/${gift.id}`}
                    >
                      {gift.closed ||
                      gift.purchased ||
                      gift.confirmed >= gift.target
                        ? "Voir cette envie"
                        : "Participer à cette envie"}
                      <Icon name="arrow" size={17} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="gift" size={40} />
              </span>
              <h3>
                {gifts.length
                  ? "Cette envie se cache encore…"
                  : "Les premières envies arrivent bientôt"}
              </h3>
              <p>
                {gifts.length
                  ? "Essayez une autre catégorie ou quelques mots différents."
                  : "La sélection prend forme. Revenez découvrir les prochaines idées."}
              </p>
              {!profile && (
                <a className="text-link" href="/admin">
                  Espace propriétaire <Icon name="arrow" size={16} />
                </a>
              )}
            </div>
          )}
        </section>
        <section className="container how-section" id="comment">
          <div className="how-intro">
            <span className="eyebrow">Comment ça marche</span>
            <h2>
              Une envie.
              <br />
              Un coup de pouce.
            </h2>
            <p>
              Vous contribuez, je choisis le bon moment pour acheter. Chaque
              geste fait plaisir.
            </p>
          </div>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Une envie vous parle</h3>
                <p>Choisissez un cadeau et le montant qui vous convient.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Votre attention arrive directement</h3>
                <p>
                  Envoyez votre contribution au propriétaire via son lien
                  PayPal.Me.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>L’envie prend forme</h3>
                <p>
                  Le propriétaire vérifie le versement, confirme le financement
                  et achète lui-même le cadeau.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <div className="container transparency">
          <Icon name="heart" size={20} />
          <p>
            Aucune commission ajoutée par Wishlister. Des frais PayPal peuvent
            s’appliquer. Le financement est flexible : l’argent reçu reste chez
            le propriétaire même si l’objectif n’est pas atteint. Il n’y a ni
            commande, ni expédition, ni remboursement automatiques.
          </p>
        </div>
      </main>
      <footer className="site-footer container">
        <Brand />
        <span>Fait pour partager des envies, simplement.</span>
        <a href="/admin">
          <Icon name="lock" size={14} />
          Espace propriétaire
        </a>
      </footer>
    </>
  );
}
