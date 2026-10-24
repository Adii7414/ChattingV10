import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const q = async (query: string, params: unknown[]) => { try { return (await zite.sql({ query, params })).rows; } catch (e) { console.error('myStats', e); return []; } };

export default createEndpoint({
  description: 'Personal messaging stats for the signed-in user, plus an export of their own messages',
  authenticated: true,
  inputSchema: z.object({ export: z.boolean().optional() }),
  outputSchema: z.object({
    total: z.number(), week: z.number(), today: z.number(), reactionsGiven: z.number(), streak: z.number(), longestStreak: z.number(), avgLength: z.number(),
    topChats: z.array(z.object({ conversationId: z.string(), n: z.number() })), hours: z.array(z.object({ h: z.number(), n: z.number() })),
    days: z.array(z.object({ day: z.string(), n: z.number() })), emojis: z.array(z.object({ emoji: z.string(), n: z.number() })),
    exported: z.array(z.object({ body: z.string(), conversationId: z.string(), sentAt: z.string() })),
  }),
  execute: async ({ input, context }) => {
    const me = context.user.id;
    const mine = `m."sender"->>0 = $1`;
    const [tot, top, hrs, days, emo, active, exp] = await Promise.all([
      q(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE m.created_at > now() - interval '7 days') AS week, COUNT(*) FILTER (WHERE m.created_at >= date_trunc('day', now())) AS today,
           COALESCE(AVG(length(m."body")), 0) AS avg, (SELECT COUNT(*) FROM "Reactions" r WHERE r."reactor"->>0 = $1) AS reactions FROM "Messages" m WHERE ${mine}`, [me]),
      q(`SELECT l."conversationsId"::text AS cid, COUNT(*) AS n FROM "Messages" m JOIN "ConversationsMessages" l ON l."messagesId" = m.id WHERE ${mine} AND m.created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [me]),
      q(`SELECT EXTRACT(HOUR FROM m.created_at)::int AS h, COUNT(*) AS n FROM "Messages" m WHERE ${mine} AND m.created_at > now() - interval '90 days' GROUP BY 1`, [me]),
      q(`SELECT to_char(g.d, 'YYYY-MM-DD') AS day, (SELECT COUNT(*) FROM "Messages" m WHERE ${mine} AND m.created_at::date = g.d::date) AS n FROM generate_series(date_trunc('day', now()) - interval '83 days', date_trunc('day', now()), interval '1 day') g(d) ORDER BY g.d`, [me]),
      q(`SELECT "emoji", COUNT(*) AS n FROM "Reactions" WHERE "reactor"->>0 = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [me]),
      q(`SELECT DISTINCT m.created_at::date AS d FROM "Messages" m WHERE ${mine} AND m.created_at > now() - interval '365 days' ORDER BY 1 DESC`, [me]),
      input.export ? q(`SELECT m."body", l."conversationsId"::text AS cid, m.created_at FROM "Messages" m JOIN "ConversationsMessages" l ON l."messagesId" = m.id WHERE ${mine} ORDER BY m.created_at DESC LIMIT 2000`, [me]) : Promise.resolve([]),
    ]);
    // Streaks from distinct active days.
    const ds = active.map((r) => new Date(String(r.d)).getTime()).sort((a, b) => b - a);
    const DAY = 86400000;
    const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
    let streak = 0;
    if (ds.length && today - ds[0] <= DAY) { streak = 1; for (let i = 1; i < ds.length && ds[i - 1] - ds[i] === DAY; i++) streak++; }
    let longest = ds.length ? 1 : 0, run = 1;
    for (let i = 1; i < ds.length; i++) { run = ds[i - 1] - ds[i] === DAY ? run + 1 : 1; longest = Math.max(longest, run); }
    const t = tot[0] ?? {};
    return {
      total: Number(t.total ?? 0), week: Number(t.week ?? 0), today: Number(t.today ?? 0), reactionsGiven: Number(t.reactions ?? 0), streak, longestStreak: longest, avgLength: Math.round(Number(t.avg ?? 0)),
      topChats: top.map((r) => ({ conversationId: String(r.cid), n: Number(r.n) })),
      hours: Array.from({ length: 24 }, (_, h) => ({ h, n: Number(hrs.find((r) => Number(r.h) === h)?.n ?? 0) })),
      days: days.map((r) => ({ day: String(r.day), n: Number(r.n) })),
      emojis: emo.map((r) => ({ emoji: String(r.emoji), n: Number(r.n) })),
      exported: exp.map((r) => ({ body: String(r.body ?? ''), conversationId: String(r.cid), sentAt: String(r.created_at) })),
    };
  },
});
