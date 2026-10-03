"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./language";
import { api, Field, Notice } from "./ui";
import { Modal } from "./modal";

type Person = {
  id: string;
  name: string;
  kind: "adult" | "child";
  recipient: string;
};
type Member = {
  id: string;
  name: string;
  login: string;
  enabled: number;
  invitation_expires: number | null;
  lists: string[];
};
type FamilyData = {
  profiles: Person[];
  members: Member[];
  lists: { id: string; name: string; profile_id: string | null }[];
};
export function Family({ onChange }: { onChange: () => Promise<void> }) {
  const { t, date } = useI18n();
  const [data, setData] = useState<FamilyData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    type: "invite" | "grants" | "disable";
    member?: Member;
  } | null>(null);
  const [person, setPerson] = useState<Partial<Person> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogError, setDialogError] = useState("");
  const [link, setLink] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const refresh = async () => setData(await api<FamilyData>("admin/family"));
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const open = (type: "invite" | "grants" | "disable", member?: Member) => {
    setDialogError("");
    setSelected(member?.lists || []);
    setEditor({ type, member });
  };
  const selectLists = () => (
    <fieldset className="family-list-picker">
      <legend>{t("Listes confiées")}</legend>
      {data?.lists.map((l) => (
        <label className="checkbox" key={l.id}>
          <input
            type="checkbox"
            checked={selected.includes(l.id)}
            onChange={(e) =>
              setSelected((ids) =>
                e.target.checked
                  ? [...ids, l.id]
                  : ids.filter((id) => id !== l.id),
              )
            }
          />
          {l.name}
        </label>
      ))}
    </fieldset>
  );
  if (!data)
    return (
      <section className="panel stack">
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <button
              className="button secondary"
              onClick={() => void refresh().catch((e) => setError(e.message))}
            >
              {t("Réessayer")}
            </button>
          </>
        ) : (
          <p role="status">{t("Chargement…")}</p>
        )}
      </section>
    );
  return (
    <div className="stack family-settings">
      {error && <Notice error>{error}</Notice>}
      {link && (
        <section className="panel stack">
          <h2>{t("Invitation prête à partager")}</h2>
          <p>
            {t(
              "Ce lien personnel expire dans 7 jours et ne fonctionne qu’une fois. Transmettez-le uniquement à la personne invitée.",
            )}
          </p>
          <Field label={t("Lien d’invitation")}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopyNotice(t("Lien copié."));
                } catch {
                  setCopyNotice(
                    t("Sélectionnez le lien ci-dessus pour le copier."),
                  );
                }
              }}
            >
              {t("Copier le lien")}
            </button>
            <button
              className="text-link"
              onClick={() => {
                setLink("");
                setCopyNotice("");
              }}
            >
              {t("Masquer le lien")}
            </button>
          </div>
          {copyNotice && <p role="status">{copyNotice}</p>}
        </section>
      )}
      <section className="panel stack">
        <div className="panel-heading">
          <h2>{t("Coorganisateurs")}</h2>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => open("invite")}
          >
            {t("Inviter un proche")}
          </button>
        </div>
        <p>
          {t(
            "Chaque proche utilise son propre compte et peut préparer les envies des listes choisies. Les paiements, sauvegardes et réglages de l’instance restent réservés au propriétaire.",
          )}
        </p>
        {!data.members.length && (
          <p>
            {t(
              "Vous gérez encore vos listes seul. Invitez un proche pour les préparer ensemble.",
            )}
          </p>
        )}
        {data.members.map((m) => (
          <article className="family-member" key={m.id}>
            <div className="stack">
              <h3>{m.name}</h3>
              <p>
                {t("Identifiant de connexion")} : <strong>{m.login}</strong> ·{" "}
                {m.enabled
                  ? t("Compte actif")
                  : m.invitation_expires && m.invitation_expires > Date.now()
                    ? t("Invitation en attente")
                    : t("Accès désactivé")}
              </p>
              {!m.enabled &&
              m.invitation_expires &&
              m.invitation_expires > Date.now() ? (
                <p>
                  {t(
                    "Invitation valable jusqu’au {0}",
                    date(new Date(m.invitation_expires).toISOString()),
                  )}
                </p>
              ) : null}
              <p>
                {m.lists.length
                  ? m.lists
                      .map((id) => data.lists.find((l) => l.id === id)?.name)
                      .filter(Boolean)
                      .join(" · ")
                  : t("Aucune liste confiée")}
              </p>
            </div>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => open("grants", m)}
              >
                {t("Modifier les listes")}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => open("invite", m)}
              >
                {t("Réinviter")}
              </button>
              <button
                className="text-link"
                disabled={busy || (!m.enabled && !m.invitation_expires)}
                onClick={() => open("disable", m)}
              >
                {t("Désactiver l’accès")}
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="panel stack">
        <div className="panel-heading">
          <h2>{t("Profils familiaux")}</h2>
          <button
            className="button secondary"
            onClick={() => {
              setDialogError("");
              setPerson({ name: "", kind: "adult", recipient: "" });
            }}
          >
            {t("Ajouter un profil")}
          </button>
        </div>
        <p>
          {t(
            "Un profil indique pour qui vous préparez une liste. Un enfant n’a pas de compte ; un adulte peut être associé à son compte pour protéger ses surprises. Ces profils ne sont pas publiés dans un annuaire.",
          )}
        </p>
        {!data.profiles.length && (
          <p>{t("Aucun profil familial pour le moment.")}</p>
        )}
        {data.profiles.map((p) => (
          <article className="family-member" key={p.id}>
            <div>
              <h3>{p.name}</h3>
              <p>
                {p.kind === "child"
                  ? t("Enfant, géré par un adulte")
                  : t("Adulte")}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => {
                setDialogError("");
                setPerson(p);
              }}
            >
              {t("Modifier le profil")}
            </button>
          </article>
        ))}
      </section>
      <section className="panel stack">
        <h2>{t("Destinataire de chaque liste")}</h2>
        <p>
          {t(
            "Sans profil associé, la liste est destinée au propriétaire. Changer le destinataire modifie la protection des surprises, sans publier la liste ni donner un accès supplémentaire.",
          )}
        </p>
        {data.lists.map((l) => (
          <form
            className="family-assignment"
            key={`${l.id}-${l.profile_id}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const value = String(
                new FormData(e.currentTarget).get("profile") || "",
              );
              setBusy(true);
              setError("");
              try {
                await api("admin/family/assign", {
                  list_id: l.id,
                  profile_id: value || null,
                  confirm: true,
                });
                await refresh();
                await onChange();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={l.name}>
              <select name="profile" defaultValue={l.profile_id || ""}>
                <option value="">{t("Le propriétaire")}</option>
                {data.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <button className="button secondary" disabled={busy}>
              {t("Enregistrer le destinataire")}
            </button>
          </form>
        ))}
      </section>
      {editor && (
        <Modal
          title={
            editor.type === "invite"
              ? t("Inviter un proche")
              : editor.type === "grants"
                ? t("Modifier les listes")
                : t("Désactiver l’accès")
          }
          busy={busy}
          onClose={() => setEditor(null)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              setBusy(true);
              setDialogError("");
              try {
                if (editor.type === "invite") {
                  const result = await api<{ token: string }>(
                    "admin/family/invite",
                    {
                      id: editor.member?.id,
                      name: fields.get("name"),
                      login: fields.get("login"),
                      lists: selected,
                      confirm: true,
                    },
                  );
                  setLink(
                    `${window.location.origin}/invitation#${result.token}`,
                  );
                  setCopyNotice("");
                } else
                  await api("admin/family/access", {
                    id: editor.member!.id,
                    action: editor.type,
                    lists: selected,
                    confirm: true,
                  });
                setEditor(null);
                await refresh();
              } catch (e) {
                setDialogError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {editor.member && (
              <p>
                <strong>{editor.member.name}</strong> —{" "}
                {editor.type === "invite"
                  ? t(
                      "Une nouvelle invitation remplace l’ancienne, ferme les sessions et permet de choisir un nouveau mot de passe.",
                    )
                  : editor.type === "grants"
                    ? t(
                        "Les changements prennent effet immédiatement et déconnectent ce compte. La personne pourra se reconnecter avec ses nouveaux droits.",
                      )
                    : t(
                        "Ce compte, ses invitations et ses sessions seront désactivés. Les envies seront conservées.",
                      )}
              </p>
            )}
            {editor.type === "invite" && (
              <>
                <Field label={t("Nom du proche")}>
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={editor.member?.name || ""}
                  />
                </Field>
                <Field
                  label={t("Identifiant de connexion")}
                  hint={t(
                    "3 à 40 caractères : lettres minuscules, chiffres, point, tiret ou tiret bas.",
                  )}
                >
                  <input
                    name="login"
                    required
                    minLength={3}
                    maxLength={40}
                    pattern="[a-z0-9][a-z0-9._\-]{2,39}"
                    autoCapitalize="none"
                    autoComplete="off"
                    defaultValue={editor.member?.login || ""}
                  />
                </Field>
              </>
            )}
            {editor.type !== "disable" && selectLists()}
            {dialogError && <Notice error>{dialogError}</Notice>}
            <div className="form-actions">
              <button
                className="button primary"
                disabled={
                  busy || (editor.type === "invite" && !selected.length)
                }
              >
                {editor.type === "invite"
                  ? t("Créer le lien d’invitation")
                  : t("Confirmer")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                {t("Annuler")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {person && (
        <Modal
          title={person.id ? t("Modifier le profil") : t("Ajouter un profil")}
          busy={busy}
          onClose={() => setPerson(null)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setDialogError("");
              try {
                await api("admin/family/profile", person);
                setPerson(null);
                await refresh();
                await onChange();
              } catch (e) {
                setDialogError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={t("Nom ou surnom")}>
              <input
                required
                maxLength={80}
                value={person.name || ""}
                onChange={(e) => setPerson({ ...person, name: e.target.value })}
              />
            </Field>
            <Field label={t("Type de profil")}>
              <select
                value={person.kind}
                onChange={(e) =>
                  setPerson({
                    ...person,
                    kind: e.target.value as Person["kind"],
                    recipient: "",
                  })
                }
              >
                <option value="adult">{t("Adulte")}</option>
                <option value="child">{t("Enfant, géré par un adulte")}</option>
              </select>
            </Field>
            {person.kind === "adult" && (
              <Field
                label={t("Compte du destinataire")}
                hint={t(
                  "Si la liste utilise le mode surprise, les achats et réservations seront masqués pour ce compte.",
                )}
              >
                <select
                  value={person.recipient || ""}
                  onChange={(e) =>
                    setPerson({ ...person, recipient: e.target.value })
                  }
                >
                  <option value="">{t("Aucun compte associé")}</option>
                  <option value="owner">{t("Le propriétaire")}</option>
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.login})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {dialogError && <Notice error>{dialogError}</Notice>}
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {t("Enregistrer")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setPerson(null)}
              >
                {t("Annuler")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
