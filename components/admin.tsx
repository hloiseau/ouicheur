"use client";
import type { GiftPriority } from "../lib/priority-labels";
import packageInfo from "../package.json";
import { PageHeader } from "./page-header";
import { SurpriseNotice } from "./surprise-notice";
import { ListsEditor } from "./lists";
import { SuggestionsInbox } from "./suggestions";
import { Operations } from "./operations";
import { AccountSecurity } from "./account-security";
import { Family } from "./family";
import { History } from "./history";
import type { Wishlist } from "../lib/lists";
import { LanguageSwitcher, useI18n } from "./language";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Gift } from "../lib/gifts";
import {
  appearanceStyle,
  defaultAppearance,
  type Appearance,
} from "../lib/appearance";
import { ProfileHeader } from "./profile-header";
import { api, ApiError, Brand, Field, Icon, Notice } from "./ui";
import { ImagePicker } from "./admin-gifts";
import { Payments, type Contribution } from "./admin-payments";
import { Imports } from "./admin-imports";
import { PublicWishlist } from "./public-wishlist";
import type { Category } from "./categories";

type Profile = Appearance & {
  name: string;
  bio: string;
  avatar: string;
  banner: string;
  socials: string;
  paypal: string;
  currency: string;
  strict_contributions: number;
};
type AdminData = {
  surprises_enabled: boolean;
  surprises_revealed: boolean;
  pending_contributions: number;
  pending_suggestions: number;
  lists: Wishlist[];
  profile: Profile;
  gifts: Gift[];
  priorities: GiftPriority[];
  categories: Category[];
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
  { key: "gifts", label: "Mes envies", icon: "gift" },
  { key: "reservations", label: "Réservations", icon: "gift" },
  { key: "payments", label: "Contributions", icon: "heart" },
  { key: "imports", label: "Importer une liste", icon: "upload" },
  { key: "lists", label: "Listes et partage", icon: "book" },
  { key: "suggestions", label: "Suggestions", icon: "spark" },
  { key: "history", label: "Historique", icon: "book" },
  { key: "operations", label: "Mon instance", icon: "lock" },
  { key: "profile", label: "Mon profil", icon: "user" },
  { key: "security", label: "Accès et sécurité", icon: "lock" },
  { key: "family", label: "Famille et coorganisateurs", icon: "user" },
];
export function Admin() {
  const { t, date } = useI18n();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const params = useSearchParams();
  const [memberLogin, setMemberLogin] = useState(params.has("member"));
  const tab = params.get("tab") || "gifts";
  const page =
    navigation.some((n) => n.key === tab) || tab === "audit" ? tab : "gifts";
  const giftId =
    page === "reservations" ? params.get("gift") || undefined : undefined;
  const setPage = (next: string) => {
    const query = new URLSearchParams();
    if (next !== "gifts") query.set("tab", next);
    window.history.pushState(
      null,
      "",
      `/admin${query.size ? `?${query}` : ""}`,
    );
  };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setLoadError("");
    try {
      const updated = await api<AdminData>("admin");
      const add = new URLSearchParams(location.search).get("add");
      if (add !== null) {
        location.assign(
          `/add?url=${encodeURIComponent(add)}&title=${encodeURIComponent(new URLSearchParams(location.search).get("add_title") || "")}`,
        );
        return;
      }
      setData(updated);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setData(null);
      else setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  if (loading)
    return (
      <>
        <PageHeader />
        <main id="main" className="status-page container" role="status">
          {t("Ouverture de votre espace…")}
        </main>
      </>
    );
  if (!data && loadError)
    return (
      <>
        <PageHeader />
        <main id="main" className="status-page container">
          <h1>{t("Un petit contretemps.")}</h1>
          <Notice error>
            {t(
              "Votre espace n’a pas pu être chargé. Réessayez dans un instant.",
            )}
          </Notice>
          <button
            className="button primary"
            onClick={() => {
              setLoading(true);
              void refresh();
            }}
          >
            {t("Réessayer")}
          </button>
        </main>
      </>
    );
  if (!data)
    return (
      <>
        <PageHeader>
          <a href="/">{t("Voir la Ouichlist ↗")}</a>
        </PageHeader>
        <main id="main" className="login-page">
          <section className="login-card">
            <span className="empty-icon">
              <Icon name="lock" size={30} />
            </span>
            <span className="eyebrow">{t("Rien qu’à vous")}</span>
            <h1>{t("Le coin des envies.")}</h1>
            <p>
              {t(
                "Votre espace pour ajouter des cadeaux et prendre soin des petites attentions.",
              )}
            </p>
            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(event.currentTarget);
                try {
                  const login = await api<{ role: "owner" | "member" }>(
                    "login",
                    {
                      password: form.get("password"),
                      ...(memberLogin ? { login: form.get("login") } : {}),
                    },
                  );
                  if (login.role === "member") {
                    window.location.assign("/organiser");
                    return;
                  }
                  await refresh();
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={memberLogin}
                  onChange={(e) => setMemberLogin(e.target.checked)}
                />
                {t("Je suis coorganisateur")}
              </label>
              {memberLogin && (
                <Field label={t("Identifiant de connexion")}>
                  <input
                    name="login"
                    autoComplete="username"
                    autoCapitalize="none"
                    maxLength={40}
                    required
                  />
                </Field>
              )}
              <Field label={t("Mot de passe")}>
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
                {busy ? t("Connexion…") : t("Entrer dans mon espace")}
                <Icon name="arrow" size={17} />
              </button>
            </form>
            {memberLogin ? (
              <p className="fine-print">
                {t(
                  "Si vous perdez votre accès, demandez au propriétaire une nouvelle invitation. Vos envies seront conservées.",
                )}
              </p>
            ) : (
              <p className="fine-print">
                {t("Accès perdu ? La commande locale")}{" "}
                <code>npm run password</code>{" "}
                {t("permet de réinitialiser votre mot de passe.")}
              </p>
            )}
          </section>
        </main>
      </>
    );
  const pending = data.pending_contributions;
  return (
    <div className="owner-space">
      <header className="owner-topbar container">
        <Brand />
        <div className="header-actions">
          <a className="text-link" href="/?preview=1">
            {t("Ma Ouichlist publique ↗")}
          </a>
          <LanguageSwitcher />
        </div>
      </header>
      <div className="owner-nav container">
        <nav aria-label={t("Mon espace")}>
          {navigation.map((item) => (
            <button
              key={item.key}
              className={page === item.key ? "active" : ""}
              aria-current={page === item.key ? "page" : undefined}
              onClick={() => {
                setPage(item.key);
                setError("");
              }}
            >
              <Icon name={item.icon} size={18} />
              {t(item.label)}
              {item.key === "payments" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
              {item.key === "suggestions" && data.pending_suggestions > 0 && (
                <span className="nav-count">{data.pending_suggestions}</span>
              )}
            </button>
          ))}
          <button
            className="owner-signout"
            onClick={async () => {
              try {
                await api("logout", {});
                setData(null);
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            {t("Déconnexion")}
          </button>
        </nav>
      </div>
      <main id="main" className="owner-main container">
        {data.surprises_enabled && (
          <SurpriseNotice revealed={data.surprises_revealed} />
        )}
        {page !== "gifts" && (
          <header className="admin-header">
            <h1>
              {page === "audit"
                ? t("Journal")
                : t(navigation.find((n) => n.key === page)?.label || "")}
            </h1>
          </header>
        )}
        {error && <Notice error>{error}</Notice>}
        {loadError && (
          <Notice error>
            {t(
              "La mise à jour a échoué. Les dernières données affichées sont conservées.",
            )}{" "}
            <button className="button secondary" onClick={() => void refresh()}>
              {t("Réessayer")}
            </button>
          </Notice>
        )}
        {page === "gifts" && (
          <PublicWishlist
            embedded
            profile={{
              ...data.profile,
              payments_enabled: Number(!!data.profile.paypal),
            }}
            gifts={data.gifts}
            priorities={data.priorities}
            categories={data.categories}
            lists={data.lists}
            owner={{ gifts: data.gifts, currency: data.profile.currency }}
            onRefresh={() => void refresh()}
          />
        )}
        {page === "reservations" && (
          <div className="stack">
            {giftId && (
              <div className="form-actions">
                <a
                  className="button secondary"
                  href={`/cadeaux/${encodeURIComponent(giftId)}`}
                >
                  {t("Voir cette envie")}
                </a>
                <button
                  className="button secondary"
                  onClick={() => setPage("reservations")}
                >
                  {t("Toutes les réservations")}
                </button>
              </div>
            )}
            <History
              key={`${data.surprises_revealed}:${giftId || "all"}`}
              initialKind="reservations"
              fixed
              giftId={giftId}
              onChange={refresh}
            />
          </div>
        )}
        {page === "payments" && (
          <div className="stack">
            <label className="panel">
              <input
                type="checkbox"
                checked={!!data.profile.strict_contributions}
                onChange={async (e) => {
                  try {
                    await api("admin/strict-contributions", {
                      enabled: e.target.checked,
                    });
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
              {t("Compter uniquement les contributions validées")}
            </label>
            <History initialKind="contributions" fixed onChange={refresh} />
          </div>
        )}
        {page === "imports" && (
          <Imports
            lists={data.lists}
            priorities={data.priorities}
            categories={data.categories}
            currency={data.profile.currency}
            jobs={data.imports}
            refresh={() => void refresh()}
            onViewGifts={() => {
              setPage("gifts");
            }}
          />
        )}
        {page === "lists" && (
          <ListsEditor lists={data.lists} refresh={refresh} />
        )}
        {page === "suggestions" && (
          <SuggestionsInbox
            priorities={data.priorities}
            categories={data.categories}
            currency={data.profile.currency}
            refresh={refresh}
          />
        )}
        {page === "operations" &&
          (!data.surprises_enabled || data.surprises_revealed) && (
            <Operations />
          )}
        {page === "history" && (
          <History key={String(data.surprises_revealed)} onChange={refresh} />
        )}
        {page === "profile" && (
          <ProfileEditor profile={data.profile} refresh={refresh} />
        )}
        {page === "security" && <AccountSecurity onChange={refresh} />}
        {page === "family" && <Family onChange={refresh} />}
        {page === "audit" && (
          <section className="panel">
            <div className="panel-heading">
              <h2>{t("Journal d’administration")}</h2>
              <a href="/api/admin/export" className="button secondary" download>
                {t("Exporter mes données")}{" "}
              </a>
            </div>
            <p className="muted">
              {t(
                "Les 100 dernières opérations. L’export JSON contient l’intégralité du journal et du registre, sans mot de passe ni session.",
              )}{" "}
            </p>
            {data.audit.map((a) => (
              <details className="audit-entry" key={a.id}>
                <summary>
                  {date(a.created_at)} · {a.action}
                </summary>
                <p className="wrap-code">
                  {t("Référence :")} {a.entity_id}
                </p>
                <pre>{JSON.stringify(JSON.parse(a.detail), null, 2)}</pre>
              </details>
            ))}
          </section>
        )}
        <footer className="admin-footer">
          <button className="text-link" onClick={() => setPage("audit")}>
            {t("Journal")}
          </button>
          {t("Vos données, chez vous.")}{" "}
          <span>Ouicheur · {packageInfo.version}</span>
        </footer>
      </main>
    </div>
  );
}
function ProfileEditor({
  profile,
  refresh,
}: {
  profile: Profile;
  refresh: () => void;
}) {
  const { t } = useI18n();
  const [avatar, setAvatar] = useState(profile.avatar);
  const [banner, setBanner] = useState(profile.banner);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [socials, setSocials] = useState(
    (JSON.parse(profile.socials) as string[]).join("\n"),
  );
  const [appearance, setAppearance] = useState<Appearance>({
    background: profile.background,
    accent: profile.accent,
    banner_position: profile.banner_position,
    layout: profile.layout,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <form
        className="panel profile-editor"
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
              ...appearance,
              paypal: f.get("paypal"),
              currency: f.get("currency"),
              socials: String(f.get("socials"))
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
            });
            setNotice(t("Votre profil est enregistré."));
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="profile-editor-fields stack">
          <h2>{t("Votre profil public")}</h2>
          <Field label={t("Pseudonyme public")}>
            <input
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label={t("Présentation")}>
            <textarea
              name="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={4}
              maxLength={2000}
            />
          </Field>
          <ImagePicker
            value={avatar}
            onChange={setAvatar}
            label={t("Avatar")}
          />
          <ImagePicker
            value={banner}
            onChange={setBanner}
            label={t("Bannière")}
          />
          {banner && (
            <Field
              label={t("Position de la bannière")}
              hint={t("Déplacez le cadrage vertical dans l’aperçu.")}
            >
              <input
                type="range"
                min={0}
                max={100}
                value={appearance.banner_position}
                onChange={(event) =>
                  setAppearance({
                    ...appearance,
                    banner_position: Number(event.target.value),
                  })
                }
              />
            </Field>
          )}
          <Field label={t("Liens sociaux (un par ligne, six maximum)")}>
            <textarea
              name="socials"
              value={socials}
              onChange={(event) => setSocials(event.target.value)}
              rows={3}
            />
          </Field>
          <h3>{t("L’ambiance de votre Ouichlist")}</h3>
          <Field label={t("Couleur d’accent")}>
            <input
              type="color"
              value={appearance.accent}
              onChange={(event) =>
                setAppearance({ ...appearance, accent: event.target.value })
              }
            />
          </Field>
          <div className="accent-presets">
            {[
              ["#ff6682", t("Rose")],
              ["#b8ff3d", t("Acidulé")],
              ["#45e6cf", t("Menthe")],
            ].map(([color, label]) => (
              <button
                type="button"
                key={color}
                className="accent-swatch"
                aria-pressed={appearance.accent === color}
                onClick={() => setAppearance({ ...appearance, accent: color })}
              >
                <span style={{ backgroundColor: color }} />
                {label}
              </button>
            ))}
          </div>
          <ImagePicker
            value={appearance.background}
            onChange={(background) =>
              setAppearance((current) => ({ ...current, background }))
            }
            label={t("Image de fond")}
          />
          <Field label={t("Disposition des cadeaux")}>
            <select
              value={appearance.layout}
              onChange={(event) =>
                setAppearance({
                  ...appearance,
                  layout: event.target.value as Appearance["layout"],
                })
              }
            >
              <option value="compact">{t("Compacte · plus de cadeaux")}</option>
              <option value="comfortable">{t("Aérée · grandes cartes")}</option>
            </select>
          </Field>
          <button
            type="button"
            className="text-link"
            onClick={() => setAppearance({ ...defaultAppearance })}
          >
            {t("Restaurer le style Ouicheur")}
          </button>
          <h3>{t("Recevoir les contributions")}</h3>
          <Field
            label={t("Votre lien PayPal.Me personnel")}
            hint={t(
              "Visible dans le parcours de paiement. Votre adresse e-mail PayPal n’est pas demandée.",
            )}
          >
            <input
              name="paypal"
              defaultValue={profile.paypal}
              placeholder="https://paypal.me/yourName"
              maxLength={100}
            />
          </Field>
          <Field
            label={t("Devise des nouveaux cadeaux")}
            hint={t(
              "Les cadeaux existants conservent leur devise. Ceux dans une ancienne devise sont fermés aux nouvelles contributions ; le rapprochement des versements déjà engagés reste possible.",
            )}
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
            {busy ? t("Enregistrement…") : t("Enregistrer mon profil")}
          </button>
        </div>
        <aside
          className="profile-live-preview"
          aria-label={t("Aperçu du profil")}
        >
          <div className="preview-heading">
            <strong>{t("Aperçu du profil")}</strong>
            <span>{t("En direct")}</span>
          </div>
          <div
            className="profile-preview-page"
            style={{
              ...appearanceStyle(appearance),
              ...(appearance.background
                ? {
                    backgroundImage: `linear-gradient(#08090cd9, #08090cd9), url("${appearance.background}")`,
                  }
                : {}),
            }}
          >
            <ProfileHeader
              preview
              profile={{
                name,
                bio,
                avatar,
                banner,
                banner_position: appearance.banner_position,
                socials: JSON.stringify(
                  socials
                    .split("\n")
                    .map((value) => value.trim())
                    .filter((value) => {
                      try {
                        return ["https:", "http:"].includes(
                          new URL(value).protocol,
                        );
                      } catch {
                        return false;
                      }
                    }),
                ),
              }}
            />
            <div
              className="preview-gift-grid"
              data-layout={appearance.layout}
              aria-hidden="true"
            >
              {[0, 1, 2, 3].map((i) => (
                <span key={i}>
                  <Icon name="gift" size={22} />
                  <i />
                </span>
              ))}
            </div>
          </div>
          <p>
            {t(
              "Les changements apparaissent ici avant de publier votre profil.",
            )}
          </p>
        </aside>
      </form>
      <section className="panel stack">
        <h2>{t("Protéger mon espace")}</h2>
        <p>
          {t(
            "Gérez votre mot de passe et vos appareils connectés dans Accès et sécurité.",
          )}
        </p>
        <a className="button secondary" href="/admin?tab=security">
          {t("Accès et sécurité")}
        </a>
      </section>
      <section className="panel">
        <h2>{t("Emporter mes données")}</h2>
        <p>
          {t(
            "Export JSON du profil, des cadeaux, des contributions et de leur historique. Il contient des messages privés : conservez-le pour vous. Les images se sauvegardent avec la commande locale de sauvegarde.",
          )}{" "}
        </p>
        <a className="button secondary" href="/api/admin/export" download>
          {t("Télécharger mes données")}{" "}
        </a>
      </section>
    </div>
  );
}
