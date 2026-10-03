"use client";
import { useEffect, useState } from "react";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";
import { money as parseMoney } from "../lib/validation";
type Question = {
  id: string;
  question: string;
  answer: string;
  reported: number;
};
type Exchange = {
  id: string;
  name: string;
  event_date: string;
  timezone: string;
  budget: number | null;
  currency: string;
  state: "draft" | "drawn" | "cancelled";
  questions: number;
  accepted: number;
  wishes: string;
  reminders: number;
  questions_allowed: number;
  recipient: null | { name: string; wishes: string; questions_allowed: number };
  sent: Question[];
  inbox: Question[];
};
type AdminEvent = Omit<
  Exchange,
  | "accepted"
  | "wishes"
  | "reminders"
  | "questions_allowed"
  | "recipient"
  | "sent"
  | "inbox"
> & {
  participants: { account_id: string; name: string; accepted: number }[];
  exclusions: { giver: string; recipient: string }[];
  reports: Question[];
};
type AdminData = {
  accounts: { id: string; name: string }[];
  events: AdminEvent[];
};
const stateLabels = {
  draft: "Invitations en cours",
  drawn: "Tirage effectué",
  cancelled: "Échange annulé",
};
function QuestionCard({
  q,
  eventId,
  inbox,
  refresh,
}: {
  q: Question;
  eventId: string;
  inbox: boolean;
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n(),
    [reply, setReply] = useState(q.answer),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = async (action: "answer" | "report") => {
    setBusy(true);
    setError("");
    try {
      await api("account/exchanges/question", {
        exchange_id: eventId,
        action,
        id: q.id,
        message: action === "answer" ? reply : "",
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel stack">
      <p className="wrap-code">{q.question}</p>
      {q.answer && (
        <p className="wrap-code">
          <strong>{t("Réponse")}</strong> : {q.answer}
        </p>
      )}
      {q.reported ? (
        <Notice>
          {t("Conversation signalée. Les nouvelles questions sont bloquées.")}
        </Notice>
      ) : inbox ? (
        <>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void send("answer");
            }}
          >
            <Field label={t("Votre réponse anonyme")}>
              <textarea
                required
                maxLength={1000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </Field>
            <button className="button secondary" disabled={busy}>
              {t("Enregistrer la réponse")}
            </button>
          </form>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  t(
                    "Transmettre cette conversation à l’organisateur et bloquer les nouvelles questions ?",
                  ),
                )
              )
                void send("report");
            }}
          >
            {t("Signaler et bloquer")}
          </button>
        </>
      ) : null}
      {error && <Notice error>{error}</Notice>}
    </article>
  );
}
function MyExchange({
  event: e,
  refresh,
}: {
  event: Exchange;
  refresh: () => Promise<void>;
}) {
  const { t, money, date } = useI18n(),
    [accepted, setAccepted] = useState(!!e.accepted),
    [wishes, setWishes] = useState(e.wishes),
    [reminders, setReminders] = useState(!!e.reminders),
    [questions, setQuestions] = useState(!!e.questions_allowed),
    [question, setQuestion] = useState(""),
    [revealed, setRevealed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await fn();
      await refresh();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel stack exchange-participant">
      <h3>{e.name}</h3>
      <p>
        {t(stateLabels[e.state])} · {date(e.event_date, true)} ·{" "}
        {e.budget === null
          ? t("Budget non précisé")
          : money(e.budget, e.currency)}
      </p>
      {e.state !== "cancelled" && (
        <>
          <form
            className="stack"
            onChange={() => setSaved(false)}
            onSubmit={(ev) => {
              ev.preventDefault();
              void action(() =>
                api("account/exchanges/preferences", {
                  id: e.id,
                  accepted,
                  wishes,
                  reminders,
                  questions_allowed: questions,
                }),
              );
            }}
          >
            <label className="checkbox">
              <input
                type="checkbox"
                checked={accepted}
                disabled={e.state === "drawn"}
                onChange={(ev) => setAccepted(ev.target.checked)}
              />
              {t("J’accepte de participer à cet échange")}
            </label>
            <Field
              label={t("Mes idées pour cet échange")}
              hint={t(
                "Texte facultatif partagé seulement avec la personne qui vous offrira un cadeau. Aucun accès à une liste privée n’est accordé.",
              )}
            >
              <textarea
                maxLength={1000}
                value={wishes}
                onChange={(ev) => setWishes(ev.target.value)}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(ev) => setReminders(ev.target.checked)}
              />
              {t("Recevoir un rappel pour cet échange")}
            </label>
            <p className="fine-print">
              {t(
                "Activez aussi le type Échange de cadeaux à venir dans vos notifications, avec Toutes les listes et un canal configuré.",
              )}
            </p>
            {!!e.questions && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={questions}
                  onChange={(ev) => setQuestions(ev.target.checked)}
                />
                {t(
                  "Accepter des questions anonymes de la personne qui m’offre un cadeau",
                )}
              </label>
            )}
            <button className="button secondary" disabled={busy}>
              {t("Enregistrer ma participation")}
            </button>
          </form>
          {saved && <p role="status">{t("Participation enregistrée.")}</p>}
          {e.accepted !== 0 && (
            <a
              className="text-link"
              href={`/api/account/exchanges/calendar?id=${e.id}`}
            >
              {t("Calendrier privé sans noms ni attribution")}
            </a>
          )}
          {e.recipient && (
            <section className="panel stack">
              <h4>{t("Mon destinataire")}</h4>
              {revealed ? (
                <>
                  <p className="exchange-recipient">
                    <strong>{e.recipient.name}</strong>
                  </p>
                  {e.recipient.wishes && (
                    <p className="wrap-code">{e.recipient.wishes}</p>
                  )}
                  <button
                    className="text-link"
                    onClick={() => setRevealed(false)}
                  >
                    {t("Masquer à nouveau")}
                  </button>
                </>
              ) : (
                <button
                  className="button primary"
                  onClick={() => setRevealed(true)}
                >
                  {t("Voir mon destinataire")}
                </button>
              )}
            </section>
          )}
          {!!e.questions && e.state === "drawn" && (
            <details>
              <summary>{t("Questions anonymes")}</summary>
              <div className="stack">
                <p>
                  {t(
                    "N’indiquez pas votre identité dans les questions si vous souhaitez conserver la surprise. Dix questions au maximum ; vous pouvez désactiver leur réception à tout moment.",
                  )}
                </p>
                {e.recipient?.questions_allowed ? (
                  <form
                    className="stack"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void action(async () => {
                        await api("account/exchanges/question", {
                          exchange_id: e.id,
                          action: "ask",
                          message: question,
                        });
                        setQuestion("");
                      });
                    }}
                  >
                    <Field label={t("Question à mon destinataire")}>
                      <textarea
                        required
                        value={question}
                        maxLength={1000}
                        onChange={(ev) => setQuestion(ev.target.value)}
                      />
                    </Field>
                    <button className="button secondary" disabled={busy}>
                      {t("Poser la question")}
                    </button>
                  </form>
                ) : (
                  <p>
                    {t(
                      "Votre destinataire n’accepte pas de nouvelles questions.",
                    )}
                  </p>
                )}
                <h4>{t("Mes questions envoyées")}</h4>
                {e.sent.map((q) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    eventId={e.id}
                    inbox={false}
                    refresh={refresh}
                  />
                ))}
                <h4>{t("Questions reçues, sans identité de l’auteur")}</h4>
                {e.inbox.map((q) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    eventId={e.id}
                    inbox
                    refresh={refresh}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
function CreateExchange({
  data,
  refresh,
}: {
  data: AdminData;
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(""),
    [date, setDate] = useState(""),
    [timezone, setTimezone] = useState("Europe/Paris"),
    [budget, setBudget] = useState(""),
    [currency, setCurrency] = useState("EUR"),
    [people, setPeople] = useState<string[]>([]),
    [excluded, setExcluded] = useState<[string, string][]>([]),
    [giver, setGiver] = useState(""),
    [recipient, setRecipient] = useState(""),
    [mutual, setMutual] = useState(true),
    [questions, setQuestions] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const label = (id: string) =>
    data.accounts.find((a) => a.id === id)?.name || "";
  return (
    <details className="panel stack exchange-create">
      <summary>{t("Créer un échange familial")}</summary>
      <form
        className="stack"
        onChange={() => setSaved(false)}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !window.confirm(
              t(
                "Créer ces invitations privées ? Aucun tirage ni envoi de message n’aura lieu maintenant.",
              ),
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await api("account/exchanges/create", {
              name,
              event_date: date,
              timezone,
              budget: budget.trim() ? parseMoney(budget, true) : null,
              currency,
              participants: people,
              exclusions: excluded,
              questions,
              confirm: true,
            });
            await refresh();
            setSaved(true);
            setName("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {t(
            "Invitez d’abord les proches dans Famille et coorganisateurs. Un compte sans liste confiée suffit. Chacun devra accepter cet échange avant le tirage.",
          )}
        </p>
        <a href="/admin?tab=family">{t("Famille et coorganisateurs")}</a>
        <Field label={t("Nom de l’échange")}>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("Date de l’échange")}>
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label={t("Fuseau horaire")}>
          <input
            required
            maxLength={80}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </Field>
        <div className="form-row">
          <Field label={t("Budget indicatif par personne")}>
            <input
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <Field label={t("Devise")}>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {["EUR", "USD", "GBP", "CAD", "CHF", "JPY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="panel stack">
          <legend>{t("Participants, de 2 à 50")}</legend>
          {data.accounts.map((a) => (
            <label className="checkbox" key={a.id}>
              <input
                type="checkbox"
                checked={people.includes(a.id)}
                onChange={(e) => {
                  setPeople(
                    e.target.checked
                      ? [...people, a.id]
                      : people.filter((p) => p !== a.id),
                  );
                  setExcluded(excluded.filter((pair) => !pair.includes(a.id)));
                }}
              />
              {a.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="panel stack">
          <legend>{t("Exclusions facultatives")}</legend>
          <p>
            {t(
              "La personne à gauche ne pourra pas offrir à celle de droite. Personne ne peut se tirer soi-même.",
            )}
          </p>
          <Field label={t("Personne qui offre")}>
            <select value={giver} onChange={(e) => setGiver(e.target.value)}>
              <option value="">{t("Choisir")}</option>
              {people.map((id) => (
                <option key={id} value={id}>
                  {label(id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Personne à exclure")}>
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              <option value="">{t("Choisir")}</option>
              {people
                .filter((id) => id !== giver)
                .map((id) => (
                  <option key={id} value={id}>
                    {label(id)}
                  </option>
                ))}
            </select>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mutual}
              onChange={(e) => setMutual(e.target.checked)}
            />
            {t("Exclure ce duo dans les deux sens")}
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={
              !people.includes(giver) ||
              !people.includes(recipient) ||
              giver === recipient
            }
            onClick={() => {
              const pairs: [string, string][] = [
                [giver, recipient],
                ...(mutual ? [[recipient, giver] as [string, string]] : []),
              ];
              setExcluded([
                ...excluded,
                ...pairs.filter(
                  ([a, b]) => !excluded.some(([x, y]) => x === a && y === b),
                ),
              ]);
            }}
          >
            {t("Ajouter l’exclusion")}
          </button>
          <ul>
            {excluded.map(([a, b]) => (
              <li key={`${a}:${b}`}>
                {label(a)} → {label(b)}{" "}
                <button
                  type="button"
                  className="text-link"
                  aria-label={t(
                    "Retirer l’exclusion de {0} vers {1}",
                    label(a),
                    label(b),
                  )}
                  onClick={() =>
                    setExcluded(excluded.filter(([x, y]) => x !== a || y !== b))
                  }
                >
                  {t("Retirer")}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={questions}
            onChange={(e) => setQuestions(e.target.checked)}
          />
          {t(
            "Proposer les questions anonymes, acceptées séparément par chaque participant",
          )}
        </label>
        <button className="button primary" disabled={busy || people.length < 2}>
          {t("Créer les invitations privées")}
        </button>
        {saved && (
          <p role="status">
            {t(
              "Échange créé. Les invitations sont visibles dans les comptes participants.",
            )}
          </p>
        )}
        {error && <Notice error>{error}</Notice>}
      </form>
    </details>
  );
}
export function GiftExchanges() {
  const { t } = useI18n(),
    [events, setEvents] = useState<Exchange[] | null>(null),
    [admin, setAdmin] = useState<AdminData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const data = await api<{ owner: boolean; events: Exchange[] }>(
      "account/exchanges",
    );
    setEvents(data.events);
    if (data.owner) setAdmin(await api("account/exchanges/admin"));
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const manage = async (
    e: AdminEvent,
    action: "draw" | "cancel" | "delete",
  ) => {
    if (
      !window.confirm(
        t(
          action === "draw"
            ? "Effectuer le tirage définitif ? Les attributions ne seront visibles que dans les comptes concernés."
            : action === "cancel"
              ? "Annuler cet échange pour tout le monde ? Il faudra créer un nouvel échange pour recommencer."
              : "Supprimer cet échange annulé et ses données ?",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("account/exchanges/manage", {
        id: e.id,
        action,
        confirm: true,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack exchanges">
      <p>
        {t(
          "Chacun offre à une personne et reçoit d’une autre. Le budget est indicatif ; aucun paiement n’est collecté. L’organisateur ne voit pas les attributions des autres comptes. L’administrateur du serveur peut toutefois lire la base et les sauvegardes.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {events === null && !error && <p role="status">{t("Chargement…")}</p>}
      <h2>{t("Mes participations")}</h2>
      {events?.length === 0 && (
        <p>{t("Aucune invitation à un échange pour le moment.")}</p>
      )}
      {events?.map((e) => (
        <MyExchange
          key={`${e.id}:${e.accepted}:${e.questions_allowed}:${e.reminders}:${e.state}`}
          event={e}
          refresh={refresh}
        />
      ))}
      {admin && (
        <>
          <h2>{t("Organisation des échanges")}</h2>
          <CreateExchange data={admin} refresh={refresh} />
          {admin.events.map((e) => (
            <section className="panel stack exchange-admin" key={e.id}>
              <h3>{e.name}</h3>
              <p>{t(stateLabels[e.state])}</p>
              <ul>
                {e.participants.map((p) => (
                  <li key={p.account_id}>
                    {p.name} ·{" "}
                    {t(
                      p.accepted
                        ? "Invitation acceptée"
                        : "En attente d’accord",
                    )}
                  </li>
                ))}
              </ul>
              {e.exclusions.length > 0 && (
                <details>
                  <summary>{t("Exclusions enregistrées")}</summary>
                  <ul>
                    {e.exclusions.map((pair) => (
                      <li key={`${pair.giver}:${pair.recipient}`}>
                        {
                          e.participants.find(
                            (p) => p.account_id === pair.giver,
                          )?.name
                        }{" "}
                        →{" "}
                        {
                          e.participants.find(
                            (p) => p.account_id === pair.recipient,
                          )?.name
                        }
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="form-actions">
                {e.state === "draft" && (
                  <button
                    disabled={busy || e.participants.some((p) => !p.accepted)}
                    className="button primary"
                    onClick={() => void manage(e, "draw")}
                  >
                    {t("Effectuer le tirage une fois")}
                  </button>
                )}
                {e.state !== "cancelled" ? (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() => void manage(e, "cancel")}
                  >
                    {t("Annuler cet échange")}
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() => void manage(e, "delete")}
                  >
                    {t("Supprimer cet échange annulé")}
                  </button>
                )}
              </div>
              {e.reports.length > 0 && (
                <details>
                  <summary>{t("Conversations signalées")}</summary>
                  <p>
                    {t(
                      "Ces conversations ont été transmises volontairement par la personne concernée. Les nouvelles questions sont bloquées. Contactez les participants ou annulez l’échange si nécessaire.",
                    )}
                  </p>
                  {e.reports.map((q) => (
                    <blockquote key={q.id}>
                      <p>{q.question}</p>
                      {q.answer && <p>{q.answer}</p>}
                    </blockquote>
                  ))}
                </details>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
