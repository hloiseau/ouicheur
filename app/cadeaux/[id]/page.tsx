import { GiftDetails } from "../../../components/gift-details";
import { listPriorities } from "../../../lib/priorities";
import { cookies } from "next/headers";
import { accessFromCookies } from "../../../lib/lists";
import { notFound } from "next/navigation";
import { database } from "../../../lib/db";
import { listGifts, publicProfile } from "../../../lib/gifts";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function GiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = database();
  const access = accessFromCookies(db, await cookies());
  const gift = listGifts(db, access.owner, access, { ids: [id] }).find(
    (g) => g.id === id,
  );
  const profile = publicProfile(db);
  const priority = listPriorities(db).find((p) => p.id === gift?.priority);
  if (!gift || !profile) notFound();
  const supporters = db
    .prepare(
      `SELECT CASE WHEN c.public_name=1 THEN c.nickname ELSE '' END nickname,
    CASE WHEN c.public_message=1 THEN c.message ELSE '' END message,COALESCE(p.provenance,'manual') provenance
    FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id WHERE c.gift_id=? AND (c.public_name=1 OR c.public_message=1)
    AND CASE WHEN p.id IS NULL THEN c.approved=1 ELSE COALESCE(p.net-p.net_reversed,p.gross-MAX(p.refunded,p.net_reversed))>0 END
    ORDER BY c.created_at DESC LIMIT 30`,
    )
    .all(id)
    // SQLite rows have null prototypes; React client props need plain records.
    .map((row) => ({ ...row }));
  return (
    <GiftDetails
      gift={gift}
      profile={profile}
      priority={priority}
      supporters={supporters}
      owner={access.owner}
    />
  );
}
