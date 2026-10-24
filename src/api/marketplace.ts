import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { fail } from '../server/errors';
import { requirePerm, saveSettings, withAudit } from '../server/community';
import { hmac, mintAppKey, mintSigningSecret, mintToken } from '../server/bots';
import { audit } from '../server/audit';
import { BOT_EVENTS, BOT_PERMS } from '../lib/bots';
import { BOT_CATEGORIES, VERIFY_RULES } from '../lib/marketplace';

const arr = (s: unknown): string[] => { try { const v = JSON.parse(String(s ?? '[]')); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const cmdsOf = (s: unknown): { name: string; description: string }[] => { try { const v = JSON.parse(String(s ?? '[]')); return Array.isArray(v) ? v : []; } catch { return []; } };
const ownerOf = (o: unknown): string => {
  if (Array.isArray(o)) return String(o[0] ?? '');
  const s = String(o ?? '');
  if (s.startsWith('[')) { try { return ownerOf(JSON.parse(s)); } catch { return s; } }
  return s;
};

const Command = z.object({ name: z.string().min(1).max(32), description: z.string().max(120) });
const Listing = z.object({
  id: z.string(), name: z.string(), tagline: z.string(), description: z.string(), avatar: z.string().nullable(), accentColor: z.string(),
  category: z.string(), tags: z.array(z.string()), ownerId: z.string(), ownerName: z.string(), permissions: z.array(z.string()), eventTypes: z.array(z.string()),
  commands: z.array(Command), screenshots: z.array(z.string()), website: z.string().nullable(), supportUrl: z.string().nullable(), privacyUrl: z.string().nullable(),
  version: z.string(), status: z.string(), verificationStatus: z.string(), verificationNote: z.string().nullable(), verified: z.boolean(), featured: z.boolean(),
  installs: z.number(), rating: z.number().nullable(), ratingCount: z.number(), createdAt: z.string(), mine: z.boolean(),
  // Owner-only
  eventsUrl: z.string().nullable(), signingSecret: z.string().nullable(), removalReason: z.string().nullable(), apiKey: z.string().nullable(),
});
const Review = z.object({ id: z.string(), rating: z.number(), body: z.string(), authorId: z.string(), authorName: z.string(), developerReply: z.string().nullable(), createdAt: z.string() });

const patchSchema = z.object({
  name: z.string().min(2).max(40), tagline: z.string().min(4).max(90), description: z.string().max(4000), avatar: z.string().max(500).nullable(),
  accentColor: z.string().max(20), category: z.enum(BOT_CATEGORIES), tags: z.array(z.string().max(20)).max(8),
  permissions: z.array(z.enum(BOT_PERMS)), eventTypes: z.array(z.enum(BOT_EVENTS)), commands: z.array(Command).max(40), screenshots: z.array(z.string().url()).max(6),
  eventsUrl: z.string().url().max(500).nullable(), website: z.string().url().max(300).nullable(), supportUrl: z.string().url().max(300).nullable(), privacyUrl: z.string().url().max(300).nullable(),
  version: z.string().max(20), status: z.enum(['Draft', 'Published', 'Unlisted']),
});

async function names(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const r = await zite.sql({ query: `SELECT id::text AS id, COALESCE(NULLIF("name",''), split_part("email",'@',1)) AS n FROM "ziteUsers" WHERE id::text = ANY($1)`, params: [ids] });
  return new Map(r.rows.map((x) => [String(x.id), String(x.n)]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string } & Record<string, any>;
function shape(l: Row, me: string, ownerName: string): z.infer<typeof Listing> {
  const mine = ownerOf(l.owner) === me;
  const count = Number(l.ratingCount ?? 0);
  return {
    id: l.id, name: l.name ?? 'Bot', tagline: l.tagline ?? '', description: l.description ?? '', avatar: l.avatar || null, accentColor: l.accentColor || '#60E4C5',
    category: l.category ?? 'Other', tags: arr(l.tags), ownerId: ownerOf(l.owner), ownerName, permissions: arr(l.permissions), eventTypes: arr(l.eventTypes),
    commands: cmdsOf(l.commands), screenshots: arr(l.screenshots), website: l.website || null, supportUrl: l.supportUrl || null, privacyUrl: l.privacyUrl || null,
    version: l.version || '1.0.0', status: l.status ?? 'Draft', verificationStatus: l.verificationStatus ?? 'None', verificationNote: mine ? l.verificationNote || null : null,
    verified: l.verificationStatus === 'Verified', featured: !!l.featured, installs: Number(l.installs ?? 0), rating: count ? Math.round((Number(l.ratingSum ?? 0) / count) * 10) / 10 : null,
    ratingCount: count, createdAt: String((l as { createdAt?: string }).createdAt ?? ''), mine,
    eventsUrl: mine ? l.eventsUrl || null : null, signingSecret: mine ? l.signingSecret || null : null, removalReason: mine ? l.removalReason || null : null, apiKey: mine ? l.apiKey || null : null,
  };
}

/** Tells the developer's server a community added their bot, including that install's API key. */
async function deliverInstall(url: string, secret: string, data: Record<string, unknown>) {
  const body = JSON.stringify({ type: 'BOT_INSTALL', timestamp: new Date().toISOString(), data });
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json', 'user-agent': 'ChattingBot/1.0', 'x-chatting-event': 'BOT_INSTALL', 'x-chatting-timestamp': ts, 'x-chatting-signature': `v1=${await hmac(secret, `${ts}.${body}`)}` } });
  } catch (e) { console.error('install delivery failed', e); }
}

export default createEndpoint({
  description: 'Bot marketplace: browse, publish, review, verify and install bots',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['browse', 'get', 'mine', 'save', 'delete', 'rotateSecret', 'applyVerification', 'review', 'reply', 'install', 'installations', 'installKey', 'rotateKey']),
    q: z.string().max(80).optional(), category: z.string().optional(), sort: z.enum(['popular', 'top', 'new', 'verified']).optional(),
    listingId: z.string().optional(), patch: patchSchema.optional(),
    application: z.object({ purpose: z.string().min(40).max(2000), dataUse: z.string().min(20).max(2000), contact: z.string().email() }).optional(),
    rating: z.number().int().min(1).max(5).optional(), body: z.string().max(1000).optional(), reviewId: z.string().optional(),
    communityId: z.string().optional(), botId: z.string().optional(),
  }),
  outputSchema: z.object({
    listings: z.array(Listing), listing: Listing.nullable(), reviews: z.array(Review), myReview: Review.nullable(),
    installations: z.array(z.object({ botId: z.string(), communityId: z.string(), communityName: z.string(), installedAt: z.string(), lastActiveAt: z.string().nullable(), apiCalls: z.number() })),
    installedIn: z.array(z.string()), token: z.string().nullable(), checks: z.array(z.object({ label: z.string(), ok: z.boolean() })),
  }),
  execute: async ({ input, context }) => {
    const me = context.user.id;
    const out = { listings: [] as z.infer<typeof Listing>[], listing: null as z.infer<typeof Listing> | null, reviews: [] as z.infer<typeof Review>[], myReview: null as z.infer<typeof Review> | null, installations: [] as { botId: string; communityId: string; communityName: string; installedAt: string; lastActiveAt: string | null; apiCalls: number }[], installedIn: [] as string[], token: null as string | null, checks: [] as { label: string; ok: boolean }[] };

    const load = async (id?: string) => {
      const l = id ? await zite.botListings.findOne({ id }) : undefined;
      if (!l || (l.status === 'Removed' && ownerOf(l.owner) !== me)) throw fail('Bot not found', 'NOT_FOUND');
      return l;
    };
    const mineOnly = async () => { const l = await load(input.listingId); if (ownerOf(l.owner) !== me) throw fail('Only the bot’s developer can do that', 'FORBIDDEN'); return l; };
    const checksFor = (l: Row) => VERIFY_RULES.map((r) => ({
      label: r.label,
      ok: r.key === 'installs' ? Number(l.installs ?? 0) >= 3 : r.key === 'description' ? (l.description ?? '').length >= 80 : r.key === 'events' ? !!l.eventsUrl : r.key === 'privacy' ? !!l.privacyUrl : cmdsOf(l.commands).length > 0,
    }));

    if (input.action === 'browse') {
      const sort = input.sort ?? 'popular';
      const order = sort === 'new' ? 'created_at DESC' : sort === 'top' ? `CASE WHEN COALESCE("ratingCount",0) = 0 THEN 0 ELSE "ratingSum" / "ratingCount" END DESC, "ratingCount" DESC` : `"featured" DESC NULLS LAST, COALESCE("installs",0) DESC`;
      const r = await zite.sql({
        query: `SELECT *, created_at AS "createdAt" FROM "BotListings" WHERE "status" = 'Published'
                AND ($1 = '' OR "name" ILIKE '%' || $1 || '%' OR "tagline" ILIKE '%' || $1 || '%' OR "tags" ILIKE '%' || $1 || '%')
                AND ($2 = '' OR "category" = $2) AND ($3 = false OR "verificationStatus" = 'Verified')
                ORDER BY ${order} LIMIT 60`,
        params: [input.q?.trim() ?? '', input.category ?? '', sort === 'verified'],
      });
      const rows = r.rows.map((x) => ({ ...x, id: String(x.id), createdAt: String(x.createdAt ?? '') })) as Row[];
      const nm = await names([...new Set(rows.map((x) => ownerOf(x.owner)))]);
      out.listings = rows.map((l) => shape(l, me, nm.get(ownerOf(l.owner)) ?? 'Developer'));
      return out;
    }

    if (input.action === 'mine') {
      const { records } = await zite.botListings.findAll({ filters: { owner: me }, limit: 50 });
      // Bots made before developer keys existed get one now.
      for (const l of records) if (!l.apiKey) Object.assign(l, await zite.botListings.update({ id: l.id, record: { apiKey: mintAppKey(l.id) } as never }));
      out.listings = records.map((l) => shape(l, me, context.user.firstName || 'You'));
      return out;
    }

    if (input.action === 'save') {
      const p = input.patch;
      if (!p) throw fail('Nothing to save');
      const record = {
        name: p.name, tagline: p.tagline, description: p.description, avatar: p.avatar, accentColor: p.accentColor, category: p.category, tags: JSON.stringify(p.tags),
        permissions: JSON.stringify(p.permissions), eventTypes: JSON.stringify(p.eventTypes), commands: JSON.stringify(p.commands), screenshots: JSON.stringify(p.screenshots),
        eventsUrl: p.eventsUrl, website: p.website, supportUrl: p.supportUrl, privacyUrl: p.privacyUrl, version: p.version, status: p.status,
      };
      let l: Row;
      if (input.listingId) {
        const cur = await mineOnly();
        if (cur.status === 'Removed') throw fail('This bot was removed by Chatting staff. Contact support to appeal.');
        if (p.status === 'Published' && cur.status !== 'Published' && !(cur as { publishedReleaseId?: string }).publishedReleaseId) throw fail('A bot goes live when Chatting staff approve one of its versions. Create a version under Releases and submit it for review.');
        l = await zite.botListings.update({ id: cur.id, record: record as never });
        // Keep every installed copy in sync with the listing.
        const { records } = await zite.bots.findAll({ filters: { listingId: cur.id } as never, limit: 500 });
        for (const b of records) await zite.bots.update({ id: b.id, record: { name: p.name, avatar: p.avatar, description: p.tagline, eventsUrl: p.eventsUrl, eventTypes: p.eventTypes, permissions: p.permissions } as never });
      } else {
        if (p.status === 'Published') throw fail('Save the bot as a draft first, then submit a version for review.');
        const { records } = await zite.botListings.findAll({ filters: { owner: me }, limit: 30 });
        if (records.length >= 10) throw fail('You can publish up to 10 bots.');
        l = await zite.botListings.create({ record: { ...record, owner: me, signingSecret: mintSigningSecret(), verificationStatus: 'None', installs: 0, ratingSum: 0, ratingCount: 0, featured: false } as never });
        l = await zite.botListings.update({ id: l.id, record: { apiKey: mintAppKey(l.id) } as never });
        out.token = l.apiKey ?? null;
        await audit({ summary: `Created marketplace bot ${p.name}`, category: 'Bot', action: 'market.create', actorType: 'User', actorId: me, actorLabel: context.user.email, targetType: 'BotListing', targetId: l.id });
        // Optionally add it to one of the developer's servers to test in. The developer key already works everywhere.
        if (input.communityId) {
          const cid = input.communityId;
          const ctx = await requirePerm(cid, me, 'manageCommunity');
          const { records: inServer } = await zite.bots.findAll({ filters: { communityId: cid }, limit: 60 });
          if (inServer.length >= 25) throw fail('That server already has 25 bots. Your bot was saved — remove a bot there, then add it again.');
          const b = await zite.bots.create({ record: {
            name: p.name, avatar: p.avatar || null, description: p.tagline, owner: me, communityId: cid, kind: 'Custom', listingId: l.id, verified: false,
            permissions: p.permissions, eventTypes: p.eventTypes, eventsUrl: p.eventsUrl, signingSecret: l.signingSecret || mintSigningSecret(), config: '{}', enabled: true, apiCalls: 0, lastActiveAt: null, tokenHash: null, tokenHint: null,
          } as never });
          void b;
          l = await zite.botListings.update({ id: l.id, record: { installs: 1 } as never });
          await saveSettings(cid, withAudit(ctx.s, me, `Added ${p.name} (developer bot)`));
        }
      }
      out.listing = shape(l, me, 'You');
      out.checks = checksFor(l);
      return out;
    }

    if (input.action === 'delete') {
      const l = await mineOnly();
      const { records } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
      for (const b of records) await zite.bots.delete({ id: b.id });
      await zite.botListings.delete({ id: l.id });
      await audit({ summary: `Deleted marketplace bot ${l.name}`, category: 'Bot', action: 'market.delete', actorType: 'User', actorId: me, actorLabel: context.user.email, targetType: 'BotListing', targetId: l.id });
      return out;
    }

    if (input.action === 'rotateKey') {
      const l = await mineOnly();
      const u = await zite.botListings.update({ id: l.id, record: { apiKey: mintAppKey(l.id) } as never });
      await audit({ summary: `Regenerated the API key for ${l.name}`, category: 'Bot', action: 'market.rotateKey', actorType: 'User', actorId: me, actorLabel: context.user.email, targetType: 'BotListing', targetId: l.id, severity: 'Notice' });
      out.listing = shape(u, me, 'You');
      out.token = u.apiKey ?? null;
      return out;
    }

    if (input.action === 'rotateSecret') {
      const l = await mineOnly();
      const secret = mintSigningSecret();
      const u = await zite.botListings.update({ id: l.id, record: { signingSecret: secret } as never });
      const { records } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
      for (const b of records) await zite.bots.update({ id: b.id, record: { signingSecret: secret } as never });
      out.listing = shape(u, me, 'You');
      return out;
    }

    if (input.action === 'applyVerification') {
      const l = await mineOnly();
      if (!input.application) throw fail('Fill in the application');
      if (l.verificationStatus === 'Verified') throw fail('This bot is already verified.');
      if (l.verificationStatus === 'Pending') throw fail('Your application is already being reviewed.');
      const failed = checksFor(l).filter((c) => !c.ok);
      if (failed.length) throw fail(`Not eligible yet: ${failed.map((c) => c.label.toLowerCase()).join(', ')}.`);
      const u = await zite.botListings.update({ id: l.id, record: { verificationStatus: 'Pending', verificationApplication: JSON.stringify(input.application), verificationAppliedAt: new Date().toISOString(), verificationNote: null } as never });
      await audit({ summary: `Applied for verification: ${l.name}`, category: 'Verification', action: 'market.verify.apply', actorType: 'User', actorId: me, actorLabel: context.user.email, targetType: 'BotListing', targetId: l.id });
      out.listing = shape(u, me, 'You');
      out.checks = checksFor(u);
      return out;
    }

    if (input.action === 'review') {
      const l = await load(input.listingId);
      if (ownerOf(l.owner) === me) throw fail('You can’t review your own bot.');
      if (!input.rating) throw fail('Pick a star rating');
      const { records } = await zite.botReviews.findAll({ filters: { listingId: l.id, author: me } as never, limit: 1 });
      const prev = records[0];
      if (prev) await zite.botReviews.update({ id: prev.id, record: { rating: input.rating, body: input.body ?? '' } as never });
      else await zite.botReviews.create({ record: { listingId: l.id, author: me, rating: input.rating, body: input.body ?? '' } as never });
      const agg = await zite.sql({ query: `SELECT COALESCE(SUM("rating"),0) AS s, COUNT(*) AS n FROM "BotReviews" WHERE "listingId" = $1`, params: [l.id] });
      await zite.botListings.update({ id: l.id, record: { ratingSum: Number(agg.rows[0]?.s ?? 0), ratingCount: Number(agg.rows[0]?.n ?? 0) } as never });
      input.action = 'get' as never;
    }

    if (input.action === 'reply') {
      const l = await mineOnly();
      const r = input.reviewId ? await zite.botReviews.findOne({ id: input.reviewId }) : undefined;
      if (!r || r.listingId !== l.id) throw fail('Review not found');
      await zite.botReviews.update({ id: r.id, record: { developerReply: (input.body ?? '').trim() || null } as never });
      input.action = 'get' as never;
    }

    if (input.action === 'install') {
      const l = await load(input.listingId);
      if (l.status !== 'Published' && l.status !== 'Unlisted' && ownerOf(l.owner) !== me) throw fail('This bot isn’t available to add.');
      const cid = input.communityId;
      if (!cid) throw fail('Pick a community');
      const ctx = await requirePerm(cid, me, 'manageCommunity');
      const relId = (l as { publishedReleaseId?: string }).publishedReleaseId;
      const rel = relId ? await zite.botReleases.findOne({ id: relId }).catch(() => undefined) : undefined;
      if (rel?.botType === 'Code' && !l.eventsUrl) throw fail('This is a code-powered bot. Hosted execution isn’t available on Chatting yet, so it can only be added once its developer connects their own server (events URL).');
      const relConfig = rel ? (rel.botType === 'Prompt' ? JSON.stringify({ responder: JSON.parse(rel.promptConfig || '{}'), releaseId: rel.id }) : JSON.stringify({ releaseId: rel.id, manifest: JSON.parse(rel.manifest || '{}') })) : '{}';
      const { records } = await zite.bots.findAll({ filters: { communityId: cid }, limit: 60 });
      if (records.some((b) => b.listingId === l.id)) throw fail(`${l.name} is already in this community.`);
      if (records.length >= 25) throw fail('A community can have up to 25 bots.');
      const b = await zite.bots.create({ record: {
        name: l.name, avatar: l.avatar || null, description: l.tagline || '', owner: ownerOf(l.owner), communityId: cid, kind: 'Custom', listingId: l.id, verified: l.verificationStatus === 'Verified',
        permissions: arr(l.permissions), eventTypes: arr(l.eventTypes), eventsUrl: l.eventsUrl || null, signingSecret: l.signingSecret || mintSigningSecret(), config: relConfig, enabled: true, apiCalls: 0, lastActiveAt: null, tokenHash: null, tokenHint: null,
      } as never });
      await zite.botListings.update({ id: l.id, record: { installs: Number(l.installs ?? 0) + 1 } as never });
      await saveSettings(cid, withAudit(ctx.s, me, `Added ${l.name} from the bot marketplace`));
      await audit({ summary: `Installed ${l.name} from the marketplace`, category: 'Bot', action: 'market.install', actorType: 'User', actorId: me, actorLabel: context.user.email, targetType: 'Bot', targetId: b.id, communityId: cid, details: { listingId: l.id } });
      if (l.eventsUrl) await deliverInstall(l.eventsUrl, l.signingSecret ?? '', { botId: b.id, listingId: l.id, serverId: cid, communityId: cid, serverName: ctx.c.name ?? '' });
      input.action = 'get' as never;
    }

    if (input.action === 'installations' || input.action === 'installKey') {
      const l = await mineOnly();
      if (input.action === 'installKey') {
        const b = input.botId ? await zite.bots.findOne({ id: input.botId }) : undefined;
        if (!b || b.listingId !== l.id) throw fail('Installation not found');
        const t = await mintToken(b.id);
        await zite.bots.update({ id: b.id, record: { tokenHash: t.tokenHash, tokenHint: t.tokenHint } });
        out.token = t.token;
      }
      const r = await zite.sql({
        query: `SELECT b.id, b."communityId", COALESCE(c."name", 'Community') AS cname, b.created_at, b."lastActiveAt", COALESCE(b."apiCalls",0) AS calls
                FROM "Bots" b LEFT JOIN "Communities" c ON c.id::text = b."communityId" WHERE b."listingId" = $1 ORDER BY b.created_at DESC LIMIT 200`,
        params: [l.id],
      });
      out.installations = r.rows.map((x) => ({ botId: String(x.id), communityId: String(x.communityId ?? ''), communityName: String(x.cname), installedAt: String(x.created_at), lastActiveAt: x.lastActiveAt ? String(x.lastActiveAt) : null, apiCalls: Number(x.calls) }));
      out.listing = shape(l, me, 'You');
      return out;
    }

    // get
    const l = await load(input.listingId);
    const [{ records: reviews }, inst] = await Promise.all([
      zite.botReviews.findAll({ filters: { listingId: l.id } as never, limit: 100 }),
      zite.sql({ query: `SELECT DISTINCT "communityId" FROM "Bots" WHERE "listingId" = $1`, params: [l.id] }),
    ]);
    const nm = await names([...new Set([ownerOf(l.owner), ...reviews.map((r) => ownerOf(r.author))])]);
    out.listing = shape(l, me, nm.get(ownerOf(l.owner)) ?? 'Developer');
    out.reviews = reviews
      .map((r) => ({ id: r.id, rating: Number(r.rating ?? 0), body: r.body ?? '', authorId: ownerOf(r.author), authorName: nm.get(ownerOf(r.author)) ?? 'Someone', developerReply: r.developerReply || null, createdAt: String((r as { createdAt?: string }).createdAt ?? '') }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    out.myReview = out.reviews.find((r) => r.authorId === me) ?? null;
    out.installedIn = inst.rows.map((x) => String(x.communityId));
    if (out.listing.mine) out.checks = checksFor(l);
    return out;
  },
});
