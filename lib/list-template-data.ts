import type { WishKind, BudgetMode } from "./wish-details";
export const listTemplates = {
  birthday: { name: "Anniversaire", items: ["used", "outing", "handmade"] },
  christmas: { name: "Noël", items: ["used", "meal", "handmade"] },
  birth: { name: "Naissance", items: ["meal", "help", "used"] },
  wedding: { name: "Mariage", items: ["outing", "handmade", "help"] },
  farewell: { name: "Départ", items: ["handmade", "outing", "used"] },
  housewarming: { name: "Crémaillère", items: ["help", "meal", "used"] },
  anytime: { name: "Sans événement", items: ["used", "help", "outing"] },
} as const;
export const templateWishes: Record<
  string,
  {
    title: string;
    description: string;
    kind: WishKind;
    budget_mode: BudgetMode;
    target: string;
  }
> = {
  used: {
    title: "Un livre d’occasion à choisir",
    description:
      "Exemple à adapter : préciser le titre, l’édition et les boutiques possibles. Un petit budget suffit.",
    kind: "other",
    budget_mode: "fixed",
    target: "10",
  },
  outing: {
    title: "Une sortie ensemble",
    description:
      "Exemple à adapter : une promenade, un musée ou un atelier partagé. Choisir ensemble la date et le budget.",
    kind: "experience",
    budget_mode: "unknown",
    target: "",
  },
  handmade: {
    title: "Une attention faite main",
    description:
      "Exemple à adapter : une lettre, un dessin ou une recette à partager.",
    kind: "handmade",
    budget_mode: "free",
    target: "",
  },
  meal: {
    title: "Un repas préparé avec soin",
    description:
      "Exemple à adapter : indiquer seulement les préférences utiles et convenir d’un créneau.",
    kind: "service",
    budget_mode: "free",
    target: "",
  },
  help: {
    title: "Un coup de main",
    description:
      "Exemple à adapter : une heure d’aide pour les cartons, le jardin ou une petite réparation.",
    kind: "service",
    budget_mode: "free",
    target: "",
  },
};
