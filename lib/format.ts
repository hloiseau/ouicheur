export function formatMoney(amount: number, currency = "EUR", locale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    amount / 100,
  );
}
export const decimal = (amount: number | null | undefined) =>
  amount == null ? "" : (amount / 100).toFixed(2);
export const stateLabel: Record<string, string> = {
  intent: "Intention créée",
  declared: "Annoncée, à vérifier",
  detected: "Détectée, à vérifier",
  expired: "Intention expirée",
  rejected: "Refusée",
  visible: "Visible",
  archived: "Archivé",
  queued: "En attente",
  running: "En cours",
  preview: "Aperçu disponible",
  failed: "Accès impossible",
  done: "Import enregistré",
};
