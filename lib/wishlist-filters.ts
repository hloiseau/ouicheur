import type { Gift } from "./gifts";

export type BudgetBasis = "unit" | "total" | "remaining";
export type WishSort =
  | "priority"
  | "price"
  | "price-desc"
  | "unit-price"
  | "unit-price-desc"
  | "remaining"
  | "progress"
  | "title";
type FilterableGift = Pick<
  Gift,
  | "title"
  | "description"
  | "currency"
  | "target"
  | "quantity"
  | "funded"
  | "reserved"
  | "purchased"
  | "closed"
  | "priority"
> & { visibility?: string; surprise_hidden?: boolean };

// Empty and invalid inputs stay distinct; amounts use integer minor units.
export function parseBudget(value: string): number | null | undefined {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return undefined;
  const [whole, fraction = ""] = clean.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return amount <= 100000000 ? amount : undefined;
}

export function giftBudgetAmount(gift: FilterableGift, basis: BudgetBasis) {
  if (basis === "remaining") return Math.max(0, gift.target - gift.funded);
  if (basis === "unit")
    return Math.round(gift.target / Math.max(1, gift.quantity));
  return gift.target;
}

export function availableToGive(gift: FilterableGift, basis: BudgetBasis) {
  return (
    !gift.surprise_hidden &&
    gift.reserved !== null &&
    gift.visibility !== "archived" &&
    !gift.closed &&
    !gift.purchased &&
    gift.funded < gift.target &&
    (basis === "remaining"
      ? gift.reserved === 0
      : gift.reserved < gift.quantity)
  );
}

export function filterWishlist<T extends FilterableGift>(
  gifts: readonly T[],
  filters: {
    search: string;
    currency: string;
    basis: BudgetBasis;
    minimum: number | null;
    maximum: number | null;
    availableOnly: boolean;
    sort: WishSort;
    locale: string;
    priorityOrder?: Readonly<Record<number, number>>;
  },
): T[] {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase(filters.locale);
  const search = normalize(filters.search.trim());
  // A numeric budget without a currency would compare unrelated amounts.
  if (
    (!filters.currency &&
      (filters.minimum !== null || filters.maximum !== null)) ||
    (filters.minimum !== null &&
      filters.maximum !== null &&
      filters.minimum > filters.maximum)
  )
    return [];
  return gifts
    .filter((gift) => {
      const amount = giftBudgetAmount(gift, filters.basis);
      return (
        (!filters.currency || gift.currency === filters.currency) &&
        normalize(`${gift.title} ${gift.description}`).includes(search) &&
        (filters.minimum === null || amount >= filters.minimum) &&
        (filters.maximum === null || amount <= filters.maximum) &&
        (!filters.availableOnly || availableToGive(gift, filters.basis))
      );
    })
    .sort((a, b) => {
      if (filters.sort === "priority")
        return filters.priorityOrder
          ? (filters.priorityOrder[a.priority] ?? 999) -
              (filters.priorityOrder[b.priority] ?? 999)
          : b.priority - a.priority;
      if (filters.sort === "title")
        return a.title.localeCompare(b.title, filters.locale, {
          sensitivity: "base",
          numeric: true,
        });
      if (filters.sort === "progress")
        return b.funded / b.target - a.funded / a.target;
      // With no currency filter, monetary sorts group by currency first.
      if (a.currency !== b.currency)
        return a.currency.localeCompare(b.currency);
      const basis = filters.sort.startsWith("unit-price")
        ? "unit"
        : filters.sort === "remaining"
          ? "remaining"
          : "total";
      const difference =
        giftBudgetAmount(a, basis) - giftBudgetAmount(b, basis);
      return filters.sort.endsWith("-desc") ? -difference : difference;
    });
}
