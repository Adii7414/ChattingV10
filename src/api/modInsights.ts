import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireStaff } from '../server/staff';

const KV = z.array(z.object({ k: z.string(), n: z.number() }));
const T = z.object({ id: z.string(), subject: z.string(), email: z.string(), status: z.string(), priority: z.string(), category: z.string(), rating: z.number().nullable(), createdAt: z.string(), lastActivityAt: z.string().nullable() });

const q = async (query: string, params: unknown[] = []) => { try { return (await zite.sql({ query, params })).rows; } catch (e) { console.error('insight query failed', e); return []; } };
const kv = (rows: Record<string, unknown>[]) => rows.map((r) => ({ k: String(r.k ?? '—'), n: Number(r.n ?? 0) }));
const tk = (r: Record<string, unknown>) => ({ id: String(r.id), subject: String(r.subject ?? ''), email: String(r.requesterEmail ?? ''), status: String(r.status ?? ''), priority: String(r.priority ?? ''), category: String(r.category ?? ''), rating: r.rating == null ? null : Number(r.rating), createdAt: String(r.created_at), lastActivityAt: r.lastActivityAt ? String(r.lastActivityAt) : null });
const COLS = `id, "subject", "requesterEmail", "status", "priority", "category", "rating", created_at, "lastActivityAt"`;

export default createEndpoint({
  description: 'Support analytics: volumes, response times, CSAT, agent stats, queues, health checks and ticket export',
  authenticated: true,
  inputSchema: z.object({ search: z.string().max(120).optional(), days: z.number().int().min(7).max(90).default(30) }),
  outputSchema: z.object({
    ticketsByDay: z.array(z.object({ day: z.string(), opened: z.number(), closed: z.number() })),
    byCategory: KV, openByPriority: KV, csat: KV, busiestHours: KV, tags: KV, reportReasons: KV, agents: KV, topRequesters: KV, topCommunities: KV,
    kpis: z.object({ firstResponseMins: z.number().nullable(), resolutionHours: z.number().nullable(), unassignedOpen: z.number(), slaBreaches: z.number(), reopenRate: z.number().nullable(), repeatContacts: z.number(), backlogAgeHours: z.number().nullable(), escalated: z.number() }),
    health: z.object({ overdueScheduled: z.number(), failedBotDeliveries24h: z.number(), pendingBotReviews: z.number(), openReports: z.number() }),
    oldestOpen: z.array(T), lowRatings: z.array(T), search: z.array(T), exportRows: z.array(T),
  }),
  execute: async ({ input, context }) => {
    requireStaff(context.user);
    const d = input.days;
    const [byDay, cat, pri, csat, hours, tags, reasons, agents, reqs, comms, kpi, health, oldest, low, search, exp] = await Promise.all([
      q(`SELECT to_char(g.d,'YYYY-MM-DD') AS day, (SELECT COUNT(*) FROM "SupportTickets" t WHERE t.created_at::date = g.d::date) AS opened,
           (SELECT COUNT(*) FROM "SupportTickets" t WHERE t."status" IN ('Resolved','Closed') AND t."lastActivityAt"::date = g.d::date) AS closed
         FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') g(d) ORDER BY g.d`),
      q(`SELECT COALESCE("category",'Other') AS k, COUNT(*) AS n FROM "SupportTickets" WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC`, [d]),
      q(`SELECT COALESCE("priority",'Normal') AS k, COUNT(*) AS n FROM "SupportTickets" WHERE "status" IN ('Open','Pending') GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT "rating"::text AS k, COUNT(*) AS n FROM "SupportTickets" WHERE "rating" IS NOT NULL AND "ratedAt" > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [d]),
      q(`SELECT to_char(created_at, 'HH24') AS k, COUNT(*) AS n FROM "SupportTickets" WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [d]),
      q(`SELECT tag AS k, COUNT(*) AS n FROM "SupportTickets", jsonb_array_elements_text(COALESCE("tags",'[]'::jsonb)) tag WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, [d]),
      q(`SELECT COALESCE(NULLIF("reason",''),'Other') AS k, COUNT(*) AS n FROM "Reports" WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [d]),
      q(`SELECT COALESCE(NULLIF(u."name",''), u."email", 'Staff') AS k, COUNT(*) AS n FROM "TicketReplies" r LEFT JOIN "ziteUsers" u ON u.id::text = r."author"->>0
         WHERE r."fromStaff" = true AND COALESCE(r."internalNote", false) = false AND r."author"->>0 IS NOT NULL AND r.created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [d]),
      q(`SELECT COALESCE("requesterEmail",'unknown') AS k, COUNT(*) AS n FROM "SupportTickets" WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [d]),
      q(`SELECT COALESCE(c."name",'Community') AS k, COUNT(*) AS n FROM "Messages" m JOIN "ConversationsMessages" l ON l."messagesId" = m.id JOIN "Conversations" cv ON cv.id = l."conversationsId"
         JOIN "Communities" c ON c.id::text = cv."communityId" WHERE m.created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      q(`SELECT
          (SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - created_at)) / 60) FROM "SupportTickets" WHERE "firstResponseAt" IS NOT NULL AND created_at > now() - make_interval(days => $1)) AS frt,
          (SELECT AVG(EXTRACT(EPOCH FROM ("lastActivityAt" - created_at)) / 3600) FROM "SupportTickets" WHERE "status" IN ('Resolved','Closed') AND created_at > now() - make_interval(days => $1)) AS res,
          (SELECT COUNT(*) FROM "SupportTickets" WHERE "status" IN ('Open','Pending') AND jsonb_array_length(COALESCE("assignee",'[]'::jsonb)) = 0) AS unassigned,
          (SELECT COUNT(*) FROM "SupportTickets" WHERE "status" = 'Open' AND "firstResponseAt" IS NULL AND created_at < now() - interval '24 hours') AS sla,
          (SELECT COUNT(*) FILTER (WHERE x.n > 1) * 100.0 / NULLIF(COUNT(*),0) FROM (SELECT COUNT(*) AS n FROM "TicketReplies" r WHERE r."fromStaff" = false AND r.created_at > now() - make_interval(days => $1) GROUP BY r."ticket"->>0) x) AS reopen,
          (SELECT COUNT(*) FROM (SELECT "requesterEmail" FROM "SupportTickets" WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 HAVING COUNT(*) >= 3) y) AS repeat,
          (SELECT AVG(EXTRACT(EPOCH FROM (now() - created_at)) / 3600) FROM "SupportTickets" WHERE "status" IN ('Open','Pending')) AS backlog,
          (SELECT COUNT(*) FROM "SupportTickets" WHERE "status" IN ('Open','Pending') AND "tags" @> '["Escalated"]'::jsonb) AS escalated`, [d]),
      q(`SELECT (SELECT COUNT(*) FROM "ScheduledMessages" WHERE "status" = 'Scheduled' AND "sendAt" < now() - interval '10 minutes') AS overdue,
          (SELECT COUNT(*) FROM "BotEvents" WHERE "deliveryStatus" = 'Failed' AND created_at > now() - interval '24 hours') AS failed,
          (SELECT COUNT(*) FROM "BotListings" WHERE "verificationStatus" = 'Pending') AS botreviews,
          (SELECT COUNT(*) FROM "Reports" WHERE "status" = 'Open') AS reports`),
      q(`SELECT ${COLS} FROM "SupportTickets" WHERE "status" IN ('Open','Pending') ORDER BY created_at ASC LIMIT 10`),
      q(`SELECT ${COLS} FROM "SupportTickets" WHERE "rating" <= 2 AND "ratedAt" > now() - make_interval(days => $1) ORDER BY "ratedAt" DESC LIMIT 20`, [d]),
      input.search?.trim() ? q(`SELECT ${COLS} FROM "SupportTickets" WHERE "requesterEmail" ILIKE '%' || $1 || '%' OR "subject" ILIKE '%' || $1 || '%' OR "description" ILIKE '%' || $1 || '%' ORDER BY created_at DESC LIMIT 50`, [input.search.trim()]) : Promise.resolve([]),
      q(`SELECT ${COLS} FROM "SupportTickets" WHERE created_at > now() - make_interval(days => $1) ORDER BY created_at DESC LIMIT 2000`, [d]),
    ]);
    const k = kpi[0] ?? {}; const h = health[0] ?? {};
    const num = (v: unknown, dp = 1) => (v == null ? null : Math.round(Number(v) * 10 ** dp) / 10 ** dp);
    return {
      ticketsByDay: byDay.map((r) => ({ day: String(r.day), opened: Number(r.opened), closed: Number(r.closed) })),
      byCategory: kv(cat), openByPriority: kv(pri), csat: kv(csat), busiestHours: kv(hours), tags: kv(tags), reportReasons: kv(reasons), agents: kv(agents), topRequesters: kv(reqs), topCommunities: kv(comms),
      kpis: { firstResponseMins: num(k.frt, 0), resolutionHours: num(k.res), unassignedOpen: Number(k.unassigned ?? 0), slaBreaches: Number(k.sla ?? 0), reopenRate: num(k.reopen, 0), repeatContacts: Number(k.repeat ?? 0), backlogAgeHours: num(k.backlog), escalated: Number(k.escalated ?? 0) },
      health: { overdueScheduled: Number(h.overdue ?? 0), failedBotDeliveries24h: Number(h.failed ?? 0), pendingBotReviews: Number(h.botreviews ?? 0), openReports: Number(h.reports ?? 0) },
      oldestOpen: oldest.map(tk), lowRatings: low.map(tk), search: search.map(tk), exportRows: exp.map(tk),
    };
  },
});
