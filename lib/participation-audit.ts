import { createHash } from "node:crypto";

// Contribution IDs are bearer credentials. The ledger retains its canonical
// associations, but operational audit records must not copy actionable links.
const fingerprint = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) =>
      key === "contribution_id" && typeof entry === "string"
        ? ["contribution_fingerprint", fingerprint(entry)]
        : [key, redact(entry)],
    ),
  );
}
export function participationAudit(
  action: string,
  id: string,
  detail: unknown = {},
) {
  return {
    id: action.startsWith("contribution.") ? fingerprint(id) : id,
    detail: redact(detail),
  };
}
