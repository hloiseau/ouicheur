export type WishKind =
  "product" | "experience" | "service" | "handmade" | "other";
export type BudgetMode = "fixed" | "unknown" | "free";
export type GiftOffer = {
  id?: string;
  url: string;
  condition: "new" | "used" | "refurbished" | "handmade";
  note: string;
  price: number | null;
  currency: string;
  shipping: number | null;
  availability: "unknown" | "available" | "unavailable";
  checked_at: string | null;
};
export type WishDetails = {
  kind?: WishKind;
  budget_mode?: BudgetMode;
  size?: string;
  color?: string;
  model?: string;
  variant_note?: string;
  variant_policy?: "exact" | "flexible";
  time_hint?: string;
  original_url?: string;
  offers?: GiftOffer[];
};
export const wishKinds: Record<WishKind, string> = {
  product: "Produit",
  experience: "Expérience",
  service: "Service",
  handmade: "Fait main",
  other: "Autre envie",
};
export const offerConditions = {
  new: "Neuf",
  used: "Occasion",
  refurbished: "Reconditionné",
  handmade: "Fait main",
};
export function variantKey(g: {
  url: string;
  size?: string;
  color?: string;
  model?: string;
}) {
  return JSON.stringify(
    [g.url, g.size || "", g.color || "", g.model || ""].map((s) =>
      s.trim().toLowerCase(),
    ),
  );
}
export function variantSummary(g: WishDetails) {
  return [g.size, g.color, g.model, g.variant_note].filter(Boolean).join(" · ");
}
export function hasBudget(g: WishDetails) {
  return !g.budget_mode || g.budget_mode === "fixed";
}
