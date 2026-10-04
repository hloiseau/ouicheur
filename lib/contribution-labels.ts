import { stateLabel } from "./format.ts";

export type ContributionMethod = "paypal" | "bank_transfer" | "pledge";

export const contributionMethods: Record<ContributionMethod, string> = {
  paypal: "PayPal",
  bank_transfer: "Virement bancaire",
  pledge: "Participation promise",
};

export function contributionLabel(method: string, state: string) {
  if (method === "pledge" && state === "intent") return "Participation promise";
  if (method === "pledge" && state === "expired") return "Promesse annulée";
  return stateLabel[state];
}
