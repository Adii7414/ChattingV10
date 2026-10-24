import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireStaff } from '../server/staff';
import { audit, staffActor } from '../server/audit';
import { fail } from '../server/errors';

const Item = z.object({
  id: z.string(), name: z.string(), tagline: z.string(), description: z.string(), avatar: z.string().nullable(), category: z.string(), status: z.string(),
  verificationStatus: z.string(), application: z.object({ purpose: z.string(), dataUse: z.string(), contact: z.string() }).nullable(), appliedAt: z.string().nullable(),
  verificationNote: z.string().nullable(), featured: z.boolean(), installs: z.number(), rating: z.number().nullable(), ratingCount: z.number(), ownerName: z.string(), ownerEmail: z.string(),
  eventsUrl: z.string().nullable(), privacyUrl: z.string().nullable(), permissions: z.array(z.string()), commands: z.number(), failedDeliveries7d: z.number(), lowReviews: z.number(), createdAt: z.string(),
});

const parse = <T,>(s: unknown, d: T): T => { try { return s ? JSON.parse(String(s)) : d; } catch { return d; } };

export default createEndpoint({
  description: 'Staff review of the bot marketplace: verification queue, featuring and removals',
  authenticated: true,
  inputSchema: z.object({
    filter: z.enum(['Pending', 'Verified', 'All', 'Removed', 'Featured']).default('Pending'), q: z.string().max(80).optional(),
    listingId: z.string().optional(),
    action: z.enum(['approve', 'reject', 'revoke', 'feature', 'unfeature', 'remove', 'restore']).optional(), note: z.string().max(1000).optional(),
  }),
  outputSchema: z.object({ items: z.array(Item), stats: z.object({ pending: z.number(), verified: z.number(), published: z.number(), installs: z.number(), removed: z.number() }) }),
  execute: async ({ input, context }) => {
    requireStaff(context.user);
    const actor = staffActor(context.user);
    if (input.action && input.listingId) {
      const l = await zite.botListings.findOne({ id: input.listingId });
      if (!l) throw fail('Listing not found', 'NOT_FOUND');
      const now = new Date().toISOString();
      const a = input.action;
      const rec: Record<string, unknown> =
        a === 'approve' ? { verificationStatus: 'Verified', verifiedAt: now, verificationNote: input.note || null }
        : a === 'reject' ? { verificationStatus: 'Rejected', verificationNote: input.note || 'Your application didn’t meet our requirements yet.' }
        : a === 'revoke' ? { verificationStatus: 'None', verifiedAt: null, verificationNote: input.note || 'Verification was revoked.' }
        : a === 'feature' ? { featured: true } : a === 'unfeature' ? { featured: false }
        : a === 'remove' ? { status: 'Removed', featured: false, removalReason: input.note || 'Violates the marketplace rules' }
        : { status: 'Unlisted', removalReason: null };
      if ((a === 'reject' || a === 'remove') && !input.note?.trim()) throw fail('Add a note for the developer');
      await zite.botListings.update({ id: l.id, record: rec as never });
      if (a === 'approve' || a === 'revoke' || a === 'remove') {
        const { records } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
        for (const b of records) await zite.bots.update({ id: b.id, record: (a === 'remove' ? { enabled: false, verified: false } : { verified: a === 'approve' }) as never });
      }
      if (a === 'restore') {
        const { records } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
        for (const b of records) await zite.bots.update({ id: b.id, record: { enabled: true, verified: l.verificationStatus === 'Verified' } as never });
      }
      await audit({ summary: `Marketplace: ${a} ${l.name}`, category: a === 'approve' || a === 'reject' || a === 'revoke' ? 'Verification' : 'Bot', action: `market.${a}`, ...actor, targetType: 'BotListing', targetId: l.id, targetLabel: l.name ?? null, details: input.note ? { note: input.note } : null, severity: a === 'remove' ? 'Warning' : 'Info' });
    }

    const where = { Pending: `l."verificationStatus" = 'Pending'`, Verified: `l."verificationStatus" = 'Verified'`, Removed: `l."status" = 'Removed'`, Featured: `l."featured" = true`, All: 'true' }[input.filter];
    const [rows, stats] = await Promise.all([
      zite.sql({
        query: `SELECT l.*, l.created_at AS "createdAt", COALESCE(NULLIF(u."name",''), u."email", 'Developer') AS "ownerName", COALESCE(u."email",'') AS "ownerEmail",
                  (SELECT COUNT(*) FROM "BotEvents" e JOIN "Bots" b ON b.id::text = e."botId" WHERE b."listingId" = l.id::text AND e."deliveryStatus" = 'Failed' AND e.created_at > now() - interval '7 days') AS failed,
                  (SELECT COUNT(*) FROM "BotReviews" r WHERE r."listingId" = l.id::text AND r."rating" <= 2) AS low
                FROM "BotListings" l LEFT JOIN "ziteUsers" u ON u.id::text = l."owner"->>0
                WHERE ${where} AND ($1 = '' OR l."name" ILIKE '%' || $1 || '%' OR u."email" ILIKE '%' || $1 || '%')
                ORDER BY l."verificationAppliedAt" ASC NULLS LAST, l.created_at DESC LIMIT 100`,
        params: [input.q?.trim() ?? ''],
      }),
      zite.sql({ query: `SELECT COUNT(*) FILTER (WHERE "verificationStatus" = 'Pending') AS pending, COUNT(*) FILTER (WHERE "verificationStatus" = 'Verified') AS verified, COUNT(*) FILTER (WHERE "status" = 'Published') AS published, COALESCE(SUM("installs"),0) AS installs, COUNT(*) FILTER (WHERE "status" = 'Removed') AS removed FROM "BotListings"` }),
    ]);
    const s = stats.rows[0] ?? {};
    return {
      stats: { pending: Number(s.pending ?? 0), verified: Number(s.verified ?? 0), published: Number(s.published ?? 0), installs: Number(s.installs ?? 0), removed: Number(s.removed ?? 0) },
      items: rows.rows.map((r) => {
        const n = Number(r.ratingCount ?? 0);
        return {
          id: String(r.id), name: String(r.name ?? 'Bot'), tagline: String(r.tagline ?? ''), description: String(r.description ?? ''), avatar: r.avatar ? String(r.avatar) : null,
          category: String(r.category ?? 'Other'), status: String(r.status ?? 'Draft'), verificationStatus: String(r.verificationStatus ?? 'None'),
          application: parse<{ purpose: string; dataUse: string; contact: string } | null>(r.verificationApplication, null), appliedAt: r.verificationAppliedAt ? String(r.verificationAppliedAt) : null, verificationNote: r.verificationNote ? String(r.verificationNote) : null,
          featured: r.featured === true, installs: Number(r.installs ?? 0), rating: n ? Math.round((Number(r.ratingSum ?? 0) / n) * 10) / 10 : null, ratingCount: n,
          ownerName: String(r.ownerName), ownerEmail: String(r.ownerEmail), eventsUrl: r.eventsUrl ? String(r.eventsUrl) : null, privacyUrl: r.privacyUrl ? String(r.privacyUrl) : null,
          permissions: parse<string[]>(r.permissions, []), commands: parse<unknown[]>(r.commands, []).length, failedDeliveries7d: Number(r.failed ?? 0), lowReviews: Number(r.low ?? 0), createdAt: String(r.createdAt),
        };
      }),
    };
  },
});
