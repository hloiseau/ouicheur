"use client";
import { useEffect, useState } from "react";
import type { Gift } from "../lib/gifts";
import { decimal, formatMoney, stateLabel } from "../lib/format";
import { api, Brand, Field, Icon, Notice } from "./ui";
import { GiftEditor, ImagePicker } from "./admin-gifts";
import { Payments, type Contribution } from "./admin-payments";
import { Imports } from "./admin-imports";

type Profile = {
  name: string;
  bio: string;
  avatar: string;
  banner: string;
  socials: string;
  paypal: string;
  currency: string;
};
type AdminData = {
  profile: Profile;
  gifts: Gift[];
  categories: { id: string; name: string }[];
  contributions: Contribution[];
  imports: {
    id: string;
    source: string;
    state: string;
    error: string;
    attempts: number;
  }[];
  audit: {
    id: number;
    action: string;
    entity_id: string;
    detail: string;
    created_at: string;
  }[];
};
const navigation = [
  { key: "overview", label: "Vue d’ensemble", icon: "grid" },
  { key: "gifts", label: "Mes envies", icon: "gift" },
  { key: "payments", label: "Contributions", icon: "heart" },
  { key: "imports", label: "Importer une liste", icon: "upload" },
  { key: "profile", label: "Mon profil", icon: "user" },
  { key: "audit", label: "Journal", icon: "book" },
];
export function Admin({ initialized }: { initialized: boolean }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Gift | "new" | null>(null);
  const refresh = async () => {
    try {
      setData(await api<AdminData>("admin"));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  if (loading)
    return (
      <main id="main" className="status-page container" role="status">
        Ouverture de votre espace…
      </main>
    );
  if (!data)
    return (
      <>
        <header className="site-header">
          <div className="container header-inner">
            <Brand />
            <a href="/">Voir la wishlist ↗</a>
          </div>
        </header>
        <main id="main" className="login-page">
          <section className="login-card">
            <span className="empty-icon">
              <Icon name="lock" size={30} />
            </span>
            <span className="eyebrow">Rien qu’à vous</span>
            <h1>Le coin des envies.</h1>
            <p>
              Votre espace pour ajouter des cadeaux et prendre soin des petites
              attentions.
            </p>
            {!initialized ? (
              <Notice>
                Cette instance attend son propriétaire. Sur votre serveur,
                lancez <code>npm run setup</code> (ou{" "}
                <code>docker compose exec -it app npm run setup</code>). La
                création du compte est uniquement locale.
              </Notice>
            ) : (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const f = new FormData(e.currentTarget);
                  try {
                    await api("login", { password: f.get("password") });
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label="Mot de passe">
                  <input
                    type="password"
                    required
                    name="password"
                    autoComplete="current-password"
                    maxLength={256}
                  />
                </Field>
                {error && <Notice error>{error}</Notice>}
                <button className="button primary wide" disabled={busy}>
                  {busy ? "Connexion…" : "Entrer dans mon espace"}
                  <Icon name="arrow" size={17} />
                </button>
              </form>
            )}
            <p className="fine-print">
              Accès perdu ? La commande locale <code>npm run password</code>{" "}
              permet de réinitialiser votre mot de passe.
            </p>
          </section>
        </main>
      </>
    );
  const pending = data.contributions.filter(
    (c) => !c.payment_id && ["declared", "detected"].includes(c.state),
  ).length;
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand />
        <span className="sidebar-label">Mon petit espace</span>
        <nav aria-label="Administration">
          {navigation.map((item) => (
            <button
              key={item.key}
              className={page === item.key ? "active" : ""}
              aria-current={page === item.key ? "page" : undefined}
              onClick={() => {
                setPage(item.key);
                setEditor(null);
                setError("");
              }}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
              {item.key === "payments" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
            </button>
          ))}
          <button
            className="mobile-signout"
            onClick={async () => {
              try {
                await api("logout", {});
                setData(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Icon name="lock" size={19} /> Déconnexion
          </button>
        </nav>
        <div className="sidebar-bottom">
          <a
            className="button secondary"
            href="/"
            target="_blank"
            rel="noreferrer"
          >
            Ma wishlist publique ↗
          </a>
          <button
            className="text-link"
            onClick={async () => {
              try {
                await api("logout", {});
                setData(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Se déconnecter
          </button>
          <span className="sidebar-person">
            <span>{data.profile.name.slice(0, 1).toUpperCase()}</span>
            {data.profile.name}
            <small>Propriétaire</small>
          </span>
        </div>
      </aside>
      <main id="main" className="admin-main">
        <header className="admin-header">
          <div>
            <span className="eyebrow">Votre wishlist personnelle</span>
            <h1>
              {page === "overview"
                ? `Bonjour ${data.profile.name} ✦`
                : navigation.find((n) => n.key === page)?.label}
            </h1>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setPage("gifts");
              setEditor("new");
            }}
          >
            <Icon name="plus" size={18} />
            Ajouter une envie
          </button>
        </header>
        {error && <Notice error>{error}</Notice>}
        {page === "overview" && (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <Icon name="gift" />
                <strong>
                  {data.gifts.filter((g) => g.visibility === "visible").length}
                </strong>
                <span>envies à partager</span>
              </div>
              <div className="stat-card">
                <Icon name="heart" />
                <strong>{pending}</strong>
                <span>attentions à vérifier</span>
              </div>
              <div className="stat-card">
                <Icon name="check" />
                <strong>
                  {data.gifts.filter((g) => g.confirmed >= g.target).length}
                </strong>
                <span>objectifs atteints</span>
              </div>
            </div>
            {!data.profile.paypal && (
              <Notice>
                Configurez votre lien PayPal.Me dans « Mon profil » pour ouvrir
                les contributions.
              </Notice>
            )}
            <section className="panel">
              <div className="panel-heading">
                <h2>Vérifier les contributions</h2>
                <span className="badge amber">Confirmation manuelle</span>
              </div>
              <p>
                Vous recevez directement les versements sur votre compte
                particulier. Vérifiez chaque transaction dans PayPal, puis
                confirmez-la dans « Contributions ». Aucune déclaration visiteur
                n’est créditée automatiquement.
              </p>
              <button
                className="button secondary"
                onClick={() => setPage("payments")}
              >
                Consulter les contributions <Icon name="arrow" size={17} />
              </button>
            </section>
          </>
        )}
        {page === "gifts" &&
          (editor ? (
            <GiftEditor
              key={editor === "new" ? "new" : editor.id}
              gift={editor === "new" ? null : editor}
              categories={data.categories}
              currency={data.profile.currency}
              onDone={() => {
                setEditor(null);
                void refresh();
              }}
            />
          ) : (
            <>
              <div className="panel">
                <div className="panel-heading">
                  <h2>Ma collection</h2>
                  <span className="muted">{data.gifts.length} envie(s)</span>
                </div>
                {!data.gifts.length ? (
                  <div className="empty-state compact">
                    <Icon name="gift" size={36} />
                    <h3>Votre première envie vous attend.</h3>
                    <p>
                      Ajoutez un lien produit ou importez votre liste existante.
                    </p>
                  </div>
                ) : (
                  <div className="admin-gifts">
                    {data.gifts.map((g) => (
                      <article className="admin-gift-row" key={g.id}>
                        <div className="mini-art">
                          {g.image ? (
                            <img src={g.image} alt="" />
                          ) : (
                            <Icon name="gift" size={28} />
                          )}
                        </div>
                        <div>
                          <h3>{g.title}</h3>
                          <p>
                            {formatMoney(g.confirmed, g.currency)} nets /{" "}
                            {formatMoney(g.target, g.currency)} ·{" "}
                            {g.category || "Sans catégorie"}
                          </p>
                          {g.currency !== data.profile.currency && (
                            <small>
                              Ancienne devise : nouvelles contributions fermées.
                            </small>
                          )}
                        </div>
                        <span className="badge">
                          {g.purchased ? "Acheté" : stateLabel[g.visibility]}
                        </span>
                        <button
                          className="button secondary"
                          onClick={() => setEditor(g)}
                        >
                          Modifier
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <Categories categories={data.categories} refresh={refresh} />
            </>
          ))}
        {page === "payments" && (
          <Payments
            contributions={data.contributions}
            refresh={() => void refresh()}
          />
        )}
        {page === "imports" && (
          <Imports
            categories={data.categories}
            currency={data.profile.currency}
            jobs={data.imports}
            refresh={() => void refresh()}
          />
        )}
        {page === "profile" && (
          <ProfileEditor profile={data.profile} refresh={refresh} />
        )}
        {page === "audit" && (
          <section className="panel">
            <div className="panel-heading">
              <h2>Journal d’administration</h2>
              <a href="/api/admin/export" className="button secondary" download>
                Exporter mes données
              </a>
            </div>
            <p className="muted">
              Les 100 dernières opérations. L’export JSON contient l’intégralité
              du journal et du registre, sans mot de passe ni session.
            </p>
            {data.audit.map((a) => (
              <details className="audit-entry" key={a.id}>
                <summary>
                  {new Date(a.created_at).toLocaleString("fr-FR")} · {a.action}
                </summary>
                <p className="wrap-code">Référence : {a.entity_id}</p>
                <pre>{JSON.stringify(JSON.parse(a.detail), null, 2)}</pre>
              </details>
            ))}
          </section>
        )}
        <footer className="admin-footer">
          Vos données, chez vous. <span>Wishlister · 1.0</span>
        </footer>
      </main>
    </div>
  );
}
function Categories({
  categories,
  refresh,
}: {
  categories: { id: string; name: string }[];
  refresh: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Les catégories</h2>
      {error && <Notice error>{error}</Notice>}
      <div className="category-edit-list">
        {categories.map((c) => (
          <form
            key={c.id}
            className="inline-input"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api("admin/categories", {
                  id: c.id,
                  name: f.get("name"),
                });
                refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <input
              aria-label={`Nom de la catégorie ${c.name}`}
              name="name"
              defaultValue={c.name}
              required
              maxLength={80}
            />
            <button className="button secondary">Renommer</button>
            <button
              className="text-link"
              type="button"
              onClick={async () => {
                try {
                  await api("admin/categories/delete", { id: c.id });
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Supprimer
            </button>
          </form>
        ))}
      </div>
      <form
        className="inline-input"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setError("");
          try {
            await api("admin/categories", {
              name: new FormData(form).get("name"),
            });
            form.reset();
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          name="name"
          required
          maxLength={80}
          aria-label="Nom de la nouvelle catégorie"
          placeholder="Une nouvelle catégorie…"
        />
        <button className="button secondary" disabled={busy}>
          Ajouter
        </button>
      </form>
    </section>
  );
}
function ProfileEditor({
  profile,
  refresh,
}: {
  profile: Profile;
  refresh: () => void;
}) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [banner, setBanner] = useState(profile.banner);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const f = new FormData(e.currentTarget);
          try {
            await api("admin/profile", {
              name: f.get("name"),
              bio: f.get("bio"),
              avatar,
              banner,
              paypal: f.get("paypal"),
              currency: f.get("currency"),
              socials: String(f.get("socials"))
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
            });
            setNotice("Votre profil est enregistré.");
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Votre profil public</h2>
        <Field label="Pseudonyme public">
          <input
            name="name"
            required
            defaultValue={profile.name}
            maxLength={80}
          />
        </Field>
        <Field label="Présentation">
          <textarea
            name="bio"
            defaultValue={profile.bio}
            rows={4}
            maxLength={2000}
          />
        </Field>
        <ImagePicker value={avatar} onChange={setAvatar} label="Avatar" />
        <ImagePicker value={banner} onChange={setBanner} label="Bannière" />
        <Field label="Liens sociaux (un par ligne, six maximum)">
          <textarea
            name="socials"
            defaultValue={(JSON.parse(profile.socials) as string[]).join("\n")}
            rows={3}
          />
        </Field>
        <h3>Recevoir les contributions</h3>
        <Field
          label="Votre lien PayPal.Me personnel"
          hint="Visible dans le parcours de paiement. Votre adresse e-mail PayPal n’est pas demandée."
        >
          <input
            name="paypal"
            defaultValue={profile.paypal}
            placeholder="https://paypal.me/votre-nom"
            maxLength={100}
          />
        </Field>
        <Field
          label="Devise des nouveaux cadeaux"
          hint="Les cadeaux existants conservent leur devise. Ceux dans une ancienne devise sont fermés aux nouvelles contributions ; le rapprochement des versements déjà engagés reste possible."
        >
          <select name="currency" defaultValue={profile.currency}>
            {["EUR", "USD", "GBP", "CAD", "CHF", "AUD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        <button className="button primary" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer mon profil"}
        </button>
      </form>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api("admin/password", {
              current: f.get("current"),
              password: f.get("password"),
            });
            location.reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Protéger mon espace</h2>
        <Field label="Mot de passe actuel">
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>
        <Field label="Nouveau mot de passe (12 caractères minimum)">
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
          />
        </Field>
        <button className="button secondary" disabled={busy}>
          Changer le mot de passe et fermer les sessions
        </button>
      </form>
      <section className="panel">
        <h2>Emporter mes données</h2>
        <p>
          Export JSON du profil, des cadeaux, des contributions et de leur
          historique. Il contient des messages privés : conservez-le pour vous.
          Les images se sauvegardent avec la commande locale de sauvegarde.
        </p>
        <a className="button secondary" href="/api/admin/export" download>
          Télécharger mes données
        </a>
      </section>
    </div>
  );
}
