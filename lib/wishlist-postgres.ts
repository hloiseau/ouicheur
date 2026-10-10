import { z } from "zod";
import { tenantTransaction, type PgPool } from "./catalog-postgres.ts";
import { fundingExpressions } from "./participation.ts";
import { wishlistAccess, normalizeWishlistSearch } from "./wishlist-read.ts";
import {
  wishlistCursors,
  wishlistDigest,
  wishlistChanged,
} from "./wishlist-cursor.ts";
import { AppError } from "./validation.ts";
import type { Access, Wishlist } from "./lists.ts";
import type { PublicProfile } from "./gifts.ts";
import type { WishlistPage } from "./wishlist-query.ts";

// Generate precisely the Unicode mark class used by the shared JS normalizer.
// PostgreSQL's ARE does not support \\p{M}. This small pattern is built once, not
// per row, and is a bound SQL parameter (including supplementary-plane marks).
const marks = (() => {
  const ranges: string[] = [];
  let start = -1;
  for (let i = 0; i <= 0x110000; i++) {
    const yes = i < 0x110000 && /\p{M}/u.test(String.fromCodePoint(i));
    if (yes && start < 0) start = i;
    if (!yes && start >= 0) {
      ranges.push(
        String.fromCodePoint(start) +
          (i - start > 1 ? "-" + String.fromCodePoint(i - 1) : ""),
      );
      start = -1;
    }
  }
  return `[${ranges.join("")}]`;
})();
export type WishlistDocument = {
  page: WishlistPage;
  lists: Wishlist[];
  profile: PublicProfile;
  categories: { id: string; name: string; image: string }[];
};

/** A trusted server binds the store to one tenant and a shared cursor key.
 * All row authorization, filters, aggregates and pagination execute in one SQL
 * statement/snapshot. Only page-sized gift/offer JSON leaves PostgreSQL.
 * A digest scans authorized rows in the database; this is not a claim of O(1)
 * query cost. The digest also catches operator writes without event counters.
 */
export class PostgresWishlistStore {
  readonly pool: PgPool;
  readonly tenant: string;
  readonly cursorSecret: string;
  constructor(pool: PgPool, tenant: string, cursorSecret: string) {
    this.pool = pool;
    this.tenant = tenant;
    this.cursorSecret = cursorSecret;
    z.uuid().parse(tenant);
    wishlistCursors(cursorSecret);
  }
  async query(input: unknown, original: Access): Promise<WishlistDocument> {
    return this.read(input, original);
  }
  async getGift(id: string, original: Access) {
    z.string().min(1).max(64).parse(id);
    const result = await this.read(
      { mode: original.owner ? "owner" : "public", limit: 1 },
      original,
      id,
    );
    const gift = result.page.items[0];
    if (!gift) throw new AppError("Cadeau introuvable.", 404);
    return { ...result, gift };
  }
  private async read(
    input: unknown,
    original: Access,
    giftId?: string,
  ): Promise<WishlistDocument> {
    const { query: q, admin, access } = wishlistAccess(input, original);
    const cursors = wishlistCursors(this.cursorSecret),
      cursor = q.cursor ? cursors.decode(q.cursor) : null;
    const args: unknown[] = [this.tenant];
    const param = (value: unknown) => {
      args.push(value);
      return `$${args.length}`;
    };
    const allowed = access.owner
      ? "TRUE"
      : `(l.id=ANY(${param(access.managedLists || [])}::text[]) OR (l.archived=0 AND (l.visibility='public' OR (l.visibility='unlisted' AND l.id=ANY(${param(access.lists)}::text[])))))`;
    const scope = [
      allowed,
      ...(q.list ? [`l.id=${param(q.list)}`] : []),
      ...(!admin || access.owner
        ? []
        : [`l.id=ANY(${param(access.managedLists || [])}::text[])`]),
    ].join(" AND ");
    const hidden =
      !(access.recipient ?? access.owner) || access.revealSurprises
        ? "FALSE"
        : `(l.surprise_mode=1${access.recipientLists === undefined ? "" : ` AND l.id=ANY(${param(access.recipientLists)}::text[])`})`;
    const funds = fundingExpressions("postgres", "t.strict_contributions");
    const budget = (basis: string) =>
      basis === "remaining"
        ? "GREATEST(0,target-funded)"
        : basis === "unit"
          ? "round(target::numeric/quantity)"
          : "target";
    const conditions: string[] = [];
    if (q.category) conditions.push(`category_id=${param(q.category)}`);
    if (q.priority) conditions.push(`priority=${param(Number(q.priority))}`);
    if (q.currency) conditions.push(`currency=${param(q.currency)}`);
    if (q.search)
      conditions.push(
        `strpos(lower(regexp_replace(normalize(title||' '||description||' '||concat_ws(' · ',NULLIF(size,''),NULLIF(color,''),NULLIF(model,''),NULLIF(variant_note,''))||' '||time_hint,NFD),${param(marks)},'','g')),${param(normalizeWishlistSearch(q.search, q.locale))})>0`,
      );
    if (
      (!q.currency && (q.minimum !== undefined || q.maximum !== undefined)) ||
      (q.minimum !== undefined &&
        q.maximum !== undefined &&
        q.minimum > q.maximum)
    )
      conditions.push("FALSE");
    if (q.minimum !== undefined)
      conditions.push(
        `budget_mode<>'unknown' AND ${budget(q.basis)}>=${param(q.minimum)}`,
      );
    if (q.maximum !== undefined)
      conditions.push(
        `budget_mode<>'unknown' AND ${budget(q.basis)}<=${param(q.maximum)}`,
      );
    if (q.available === "1")
      conditions.push(
        `((SELECT hidden FROM summary) OR (NOT surprise_hidden AND list_archived=0 AND visibility<>'archived' AND closed=0 AND purchased=0 AND (budget_mode<>'fixed' OR funded<target) AND reserved${q.basis === "remaining" ? "=0" : "<quantity"}))`,
      );
    const stable = "priority_position,created_at DESC,id";
    const order =
      q.sort === "manual"
        ? "position,id"
        : q.sort === "priority"
          ? stable
          : q.sort === "title"
            ? `title COLLATE ouicheur.wishlist_${q.locale},${stable}`
            : q.sort === "progress"
              ? `funded::numeric/GREATEST(1,target) DESC,${stable}`
              : `currency,(budget_mode='unknown'),${budget(q.sort.startsWith("unit-price") ? "unit" : q.sort === "remaining" ? "remaining" : "total")} ${q.sort.endsWith("-desc") ? "DESC" : "ASC"},${stable}`;
    const offset = param(cursor?.offset || 0),
      limit = param(q.limit);
    const sql = `WITH allowed_lists AS MATERIALIZED (
      SELECT l.* FROM ouicheur.lists l WHERE l.tenant_id=$1 AND ${scope}
    ), raw AS MATERIALIZED (
      SELECT g.id,g.list_id,g.url,g.title,g.description,g.image,CASE WHEN g.budget_mode='fixed' THEN g.target ELSE 0 END target,g.quantity,g.currency,g.category_id,g.priority_id AS priority,g.visibility,g.position,
        g.kind,g.budget_mode,g.size,g.color,g.model,g.variant_note,g.variant_policy,g.time_hint,g.original_url,g.suggested_price,g.suggested_currency,g.extracted_at,
        g.created_at,gp.position priority_position,l.archived list_archived,c.name category,${hidden} surprise_hidden,
        CASE WHEN ${hidden} THEN NULL ELSE g.purchased END purchased,CASE WHEN ${hidden} THEN NULL ELSE g.closed END closed,
        CASE WHEN ${hidden} THEN NULL ELSE COALESCE(r.reserved,0) END reserved,
        ${Object.keys(funds)
          .map((k) => `COALESCE(f.${k},0) ${k}`)
          .join(",")},
        CASE WHEN ${hidden} THEN NULL ELSE r.deadline END deadline,
        (SELECT md5(COALESCE(string_agg(md5(to_jsonb(o)::text),'' ORDER BY o.position,o.id),'')) FROM ouicheur.gift_offers o WHERE o.tenant_id=g.tenant_id AND o.gift_id=g.id) offers_digest
      FROM ouicheur.gifts g JOIN allowed_lists l ON l.id=g.list_id
      JOIN ouicheur.tenants t ON t.id=g.tenant_id
      LEFT JOIN ouicheur.categories c ON c.tenant_id=g.tenant_id AND c.id=g.category_id
      LEFT JOIN ouicheur.gift_priorities gp ON gp.tenant_id=g.tenant_id AND gp.id=g.priority_id
      LEFT JOIN LATERAL (SELECT ${Object.entries(funds)
        .map(([k, v]) => `SUM(${v}) ${k}`)
        .join(
          ",",
        )} FROM ouicheur.contributions c LEFT JOIN ouicheur.payments p ON p.tenant_id=c.tenant_id AND p.contribution_id=c.id WHERE c.tenant_id=g.tenant_id AND c.gift_id=g.id) f ON TRUE
      LEFT JOIN LATERAL (SELECT SUM(quantity) reserved,MIN(expires_at) FILTER(WHERE state='reserved') deadline FROM ouicheur.reservations WHERE tenant_id=g.tenant_id AND gift_id=g.id AND (state='purchased' OR (state='reserved' AND expires_at>statement_timestamp()))) r ON TRUE
      WHERE g.tenant_id=$1 AND g.details_ready=1 ${admin ? "" : "AND g.visibility='visible'"} ${giftId ? `AND g.id=${param(giftId)}` : ""}
    ), priorities AS (
      SELECT p.id,p.name,p.position,p.featured FROM ouicheur.gift_priorities p WHERE p.tenant_id=$1 ${admin ? "" : "AND EXISTS(SELECT 1 FROM raw WHERE priority=p.id)"} ORDER BY p.position,p.id
    ), summary AS (
      SELECT COALESCE(bool_or(surprise_hidden) FILTER(WHERE visibility<>'archived'),FALSE) hidden,
      count(*) FILTER(WHERE visibility<>'archived') all_count,
      count(*) FILTER(WHERE visibility='archived') archived_count,
      count(*) FILTER(WHERE visibility<>'archived' AND priority=(SELECT id FROM priorities WHERE featured=1)) favorites_count,
      count(*) FILTER(WHERE visibility<>'archived' AND (purchased=1 OR (budget_mode='fixed' AND funded>=target))) completed_count,
      count(*) all_total,
      md5(COALESCE(string_agg(md5(to_jsonb(raw)::text),'' ORDER BY id),'')) digest,
      MIN(deadline) deadline FROM raw
    ), scoped AS MATERIALIZED (
      SELECT * FROM raw WHERE ${q.view === "archived" && admin ? "visibility='archived'" : "visibility<>'archived'"}
      ${q.view === "favorites" ? "AND priority=(SELECT id FROM priorities WHERE featured=1)" : q.view === "completed" ? "AND ((SELECT hidden FROM summary) OR purchased=1 OR (budget_mode='fixed' AND funded>=target))" : ""}
    ), filtered AS MATERIALIZED (SELECT * FROM scoped ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}),
    page AS (SELECT * FROM filtered ORDER BY ${order} OFFSET ${offset} LIMIT ${limit}),
    categories AS (
      SELECT c.id,c.name,c.image,count(*) count,COALESCE((array_agg(s.image ORDER BY s.priority_position,s.created_at DESC,s.id) FILTER(WHERE s.image<>''))[1],'') preview_image
      FROM scoped s JOIN ouicheur.categories c ON c.tenant_id=$1 AND c.id=s.category_id GROUP BY c.id,c.name,c.image ORDER BY c.name,c.id
    )
    SELECT
      (SELECT COALESCE(jsonb_agg((to_jsonb(p)-ARRAY['created_at','priority_position','list_archived','deadline','offers_digest']) || jsonb_build_object('offers',COALESCE((SELECT jsonb_agg(to_jsonb(o)-ARRAY['tenant_id','gift_id','position'] ORDER BY o.position,o.id) FROM ouicheur.gift_offers o WHERE o.tenant_id=$1 AND o.gift_id=p.id),'[]'::jsonb)) ORDER BY ${order}), '[]'::jsonb) FROM page p) items,
      (SELECT count(*) FROM filtered)::int total,
      to_jsonb(summary) summary,
      (SELECT COALESCE(jsonb_agg(to_jsonb(l)-ARRAY['tenant_id','share_hash','created_at'] || jsonb_build_object('shared',CASE WHEN share_hash IS NULL THEN 0 ELSE 1 END) ORDER BY created_at,id),'[]'::jsonb) FROM allowed_lists l) lists,
      (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY position,id),'[]'::jsonb) FROM priorities p) priorities,
      (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY name,id),'[]'::jsonb) FROM categories c) categories,
      (SELECT count(*) FROM scoped)::int category_total,
      (SELECT COALESCE(jsonb_agg(currency ORDER BY currency),'[]'::jsonb) FROM (SELECT DISTINCT currency FROM raw) c) currencies,
      (SELECT jsonb_build_object('name',name,'bio',bio,'avatar',avatar,'banner',banner,'socials',socials,'background',background,'accent',accent,'banner_position',banner_position,'layout',layout,'currency',currency,'strict_contributions',strict_contributions,'payments_enabled',1,'paypal_enabled',CASE WHEN paypal<>'' THEN 1 ELSE 0 END) FROM ouicheur.tenants WHERE id=$1) profile,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'image',c.image) ORDER BY c.name,c.id),'[]'::jsonb) FROM ouicheur.categories c WHERE c.tenant_id=$1 ${access.owner ? "" : "AND c.id IN (SELECT id FROM categories)"}) editor_categories
      FROM summary`;
    return tenantTransaction(this.pool, this.tenant, async (client) => {
      const r = (await client.query(sql, args)).rows[0] as any;
      if (!r.profile || (q.list && !r.lists.length))
        throw new AppError("Liste introuvable.", 404);
      const { cursor: _cursor, ...filters } = q;
      const scopeAccess = {
        ...access,
        lists: [...access.lists].sort(),
        managedLists: [...(access.managedLists || [])].sort(),
        recipientLists:
          access.recipientLists && [...access.recipientLists].sort(),
      };
      const version = wishlistDigest([
        this.tenant,
        scopeAccess,
        filters,
        r.lists,
        r.summary.digest,
        r.priorities,
        r.categories,
        r.editor_categories,
        r.profile,
      ]);
      if (cursor && cursor.version !== version) throw wishlistChanged();
      const expires = Math.min(
        cursor?.expires || Date.now() + 3600000,
        r.summary.deadline ? new Date(r.summary.deadline).getTime() : Infinity,
      );
      const nextOffset = (cursor?.offset || 0) + r.items.length;
      const page: WishlistPage = {
        items: r.items,
        total: r.total,
        version,
        next:
          nextOffset < r.total
            ? cursors.encode({ version, offset: nextOffset, expires })
            : null,
        counts: {
          all: r.summary.all_count,
          favorites: r.summary.favorites_count,
          completed: r.summary.hidden ? null : r.summary.completed_count,
          archived: admin ? r.summary.archived_count : 0,
        },
        categories: r.categories,
        category_total: r.category_total,
        priorities: r.priorities,
        currencies: r.currencies,
        hidden: r.summary.hidden,
        all_total: r.summary.all_total,
        mode: q.mode,
      };
      return {
        page,
        lists: r.lists,
        profile: r.profile,
        categories: r.editor_categories,
      };
    });
  }
}
