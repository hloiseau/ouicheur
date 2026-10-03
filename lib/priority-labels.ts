export type GiftPriority = {
  id: number;
  name: string | null;
  position: number;
  featured: number;
};
export function priorityLabel(
  priority: GiftPriority,
  t: (key: string) => string,
) {
  return (
    priority.name ??
    t(
      ["Une petite envie", "J’aimerais beaucoup", "Coup de cœur"][
        priority.id
      ] || "Priorité",
    )
  );
}
