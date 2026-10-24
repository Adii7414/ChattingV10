import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { fail } from '../server/errors';
import { hmac } from '../server/bots';
import { audit } from '../server/audit';

const ownerOf = (o: unknown): string => (Array.isArray(o) ? String(o[0] ?? '') : String(o ?? ''));
const Ev = z.object({ id: z.string(), seq: z.number(), type: z.string(), serverId: z.string().nullable(), serverName: z.string(), status: z.string(), code: z.number().nullable(), error: z.string().nullable(), createdAt: z.string(), payload: z.string() });

export default createEndpoint({
  description: 'Developer portal data for one of your bots: event log, analytics, test deliveries and leaving servers',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['events', 'stats', 'testEvent', 'removeInstall']),
    listingId: z.string(),
    type: z.string().optional(), status: z.string().optional(), botId: z.string().optional(),
  }),
  outputSchema: z.object({
    events: z.array(Ev),
    daily: z.array(z.object({ day: z.string(), events: z.number(), failed: z.number() })),
    byType: z.array(z.object({ type: z.string(), n: z.number() })),
    servers: z.array(z.object({ name: z.string(), calls: z.number() })),
    totals: z.object({ events: z.number(), delivered: z.number(), failed: z.number(), polling: z.number(), calls: z.number() }),
    test: z.object({ ok: z.boolean(), status: z.number(), ms: z.number(), error: z.string().nullable(), body: z.string() }).nullable(),
  }),
  execute: async ({ input, context }) => {
    const l = await zite.botListings.findOne({ id: input.listingId }).catch(() => undefined);
    if (!l || ownerOf(l.owner) !== context.user.id) throw fail('Bot not found', 'NOT_FOUND');
    const out = { events: [] as z.infer<typeof Ev>[], daily: [] as { day: string; events: number; failed: number }[], byType: [] as { type: string; n: number }[], servers: [] as { name: string; calls: number }[], totals: { events: 0, delivered: 0, failed: 0, polling: 0, calls: 0 }, test: null as null | { ok: boolean; status: number; ms: number; error: string | null; body: string } };
    const { records: installs } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
    const ids = installs.map((b) => b.id);

    if (input.action === 'removeInstall') {
      const b = installs.find((x) => x.id === input.botId);
      if (!b) throw fail('Installation not found');
      await zite.bots.delete({ id: b.id });
      await zite.botListings.update({ id: l.id, record: { installs: Math.max(0, Number(l.installs ?? 1) - 1) } as never });
      await audit({ summary: `Developer removed ${l.name} from a server`, category: 'Bot', action: 'dev.leave', actorType: 'User', actorId: context.user.id, actorLabel: context.user.email, targetType: 'Bot', targetId: b.id, communityId: b.communityId ?? null });
      return out;
    }

    if (input.action === 'testEvent') {
      if (!l.eventsUrl) throw fail('Add an events URL first (General information).');
      const body = JSON.stringify({ id: `test_${Date.now()}`, type: 'PING', test: true, timestamp: new Date().toISOString(), data: { message: 'Test event from the Chatting developer portal' } });
      const ts = String(Math.floor(Date.now() / 1000));
      const t0 = Date.now();
      try {
        const res = await fetch(l.eventsUrl, { method: 'POST', body, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', 'user-agent': 'ChattingBot/1.0', 'x-chatting-event': 'PING', 'x-chatting-timestamp': ts, 'x-chatting-signature': `v1=${await hmac(l.signingSecret ?? '', `${ts}.${body}`)}` } });
        out.test = { ok: res.ok, status: res.status, ms: Date.now() - t0, error: res.ok ? null : `HTTP ${res.status}`, body: (await res.text()).slice(0, 2000) };
      } catch (e) { out.test = { ok: false, status: 0, ms: Date.now() - t0, error: e instanceof Error ? e.message : 'Network error', body: '' }; }
      return out;
    }

    if (!ids.length) return out;
    if (input.action === 'events') {
      const r = await zite.sql({
        query: `SELECT e.id, e."seq", e."eventType", e."communityId", COALESCE(c."name", 'Server') AS cname, e."deliveryStatus", e."responseCode", e."error", e.created_at, e."payload"
                FROM "BotEvents" e LEFT JOIN "Communities" c ON c.id::text = e."communityId"
                WHERE e."botId" = ANY($1) AND ($2 = '' OR e."eventType" = $2) AND ($3 = '' OR e."deliveryStatus" = $3)
                ORDER BY e."seq" DESC LIMIT 100`,
        params: [ids, input.type ?? '', input.status ?? ''],
      });
      out.events = r.rows.map((e) => ({ id: String(e.id), seq: Number(e.seq), type: String(e.eventType), serverId: e.communityId ? String(e.communityId) : null, serverName: String(e.cname), status: String(e.deliveryStatus ?? ''), code: e.responseCode == null ? null : Number(e.responseCode), error: e.error ? String(e.error) : null, createdAt: new Date(String(e.created_at)).toISOString(), payload: String(e.payload ?? '') }));
      return out;
    }

    // stats
    const [daily, byType, tot, servers] = await Promise.all([
      zite.sql({ query: `SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(e.id) AS n, COUNT(e.id) FILTER (WHERE e."deliveryStatus" = 'Failed') AS f
                         FROM generate_series(current_date - 13, current_date, interval '1 day') d
                         LEFT JOIN "BotEvents" e ON e."botId" = ANY($1) AND e.created_at::date = d::date GROUP BY d ORDER BY d`, params: [ids] }),
      zite.sql({ query: `SELECT "eventType" AS t, COUNT(*) AS n FROM "BotEvents" WHERE "botId" = ANY($1) GROUP BY 1 ORDER BY 2 DESC`, params: [ids] }),
      zite.sql({ query: `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE "deliveryStatus" = 'Delivered') AS d, COUNT(*) FILTER (WHERE "deliveryStatus" = 'Failed') AS f, COUNT(*) FILTER (WHERE "deliveryStatus" = 'Polling only') AS p FROM "BotEvents" WHERE "botId" = ANY($1)`, params: [ids] }),
      zite.sql({ query: `SELECT COALESCE(c."name", 'Server') AS name, COALESCE(b."apiCalls", 0) AS calls FROM "Bots" b LEFT JOIN "Communities" c ON c.id::text = b."communityId" WHERE b.id = ANY($1::uuid[]) ORDER BY 2 DESC LIMIT 10`, params: [ids] }),
    ]);
    out.daily = daily.rows.map((x) => ({ day: String(x.day), events: Number(x.n), failed: Number(x.f) }));
    out.byType = byType.rows.map((x) => ({ type: String(x.t), n: Number(x.n) }));
    const t = tot.rows[0] ?? {};
    out.totals = { events: Number(t.n ?? 0), delivered: Number(t.d ?? 0), failed: Number(t.f ?? 0), polling: Number(t.p ?? 0), calls: installs.reduce((s, b) => s + Number(b.apiCalls ?? 0), 0) };
    out.servers = servers.rows.map((x) => ({ name: String(x.name), calls: Number(x.calls) }));
    return out;
  },
});
