export const notificationKinds = {
  declaration: "Participation à vérifier",
  reservation: "Nouvelle réservation",
  suggestion: "Suggestion à lire",
  import_failed: "Import à vérifier",
  event_reminder: "Occasion à venir",
  reservation_expiring: "Réservation bientôt expirée",
  offer_changed: "Baisse de prix ou disponibilité",
  backup_failed: "Échec de sauvegarde",
} as const;
export type NotificationKind = keyof typeof notificationKinds;
export type NotificationRule = {
  kind: NotificationKind;
  list_id: string;
  channel: "ntfy" | "email";
  frequency: "instant" | "daily";
  days: number;
};
export type NotificationPreferences = {
  enabled: boolean;
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  rules: NotificationRule[];
};
