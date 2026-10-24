import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ids } from '../server/chat';
import { loadCommunity, saveSettings, syncChannels, withAudit } from '../server/community';
import { botFromToken, botPerms, emitEvent, endGiveaway, listingFromKey, postAsBot, type Bot } from '../server/bots';
import { audit } from '../server/audit';
import { parseComponents, parseEmbeds, parseDuration, type BotPerm } from '../lib/bots';
import { parseChannel } from '../lib/community';

/** Public Bot API. One URL, JSON in → JSON out: { token, op, params }. See /developers. */
class ApiError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
const need = (b: Bot, p: BotPerm) => { if (!botPerms(b).has(p)) throw new ApiError('missing_permission', `This bot needs the “${p}” permission for that.`, 403); };
const str = (v: unknown, name: string, max = 200) => { if (typeof v !== 'string' || !v.trim()) throw new ApiError('invalid_params', `params.${name} is required`); return v.trim().slice(0, max); };
const num = (v: unknown, def: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : def));

const hits = new Map<string, number[]>();
function rateLimit(botId: string) {
  const now = Date.now();
  const arr = (hits.get(botId) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 120) throw new ApiError('rate_limited', 'Too many requests — the limit is 120 calls per minute per bot. Retry after a short wait.', 429);
  arr.push(now); hits.set(botId, arr);
}

async function channelOf(b: Bot, channelId: unknown) {
  const id = str(channelId, 'channelId', 64);
  const c = await zite.conversations.findOne({ id }).catch(() => undefined);
  if (!c || c.communityId !== b.communityId) throw new ApiError('not_found', 'Channel not found in this bot’s community.', 404);
  return c;
}
async function messageOf(b: Bot, messageId: unknown) {
  const id = str(messageId, 'messageId', 64);
  const m = await zite.messages.findOne({ id }).catch(() => undefined);
  const cid = m ? ids(m.conversation)[0] : null;
  if (!m || !cid) throw new ApiError('not_found', 'Message not found.', 404);
  const c = await channelOf(b, cid);
  return { m, channel: c };
}

const MSG_SQL = `SELECT m.id, m."body", m."sender"->>0 AS "authorId", m."botId", bt."name" AS "botName", m.created_at AS "createdAt", m."editedAt", m."parentMessageId", m."replyToId",
  m."embeds", m."components", COALESCE(m."isPinned", false) AS pinned, m."attachments", u."name" AS "authorName"
  FROM "Messages" m JOIN "ConversationsMessages" l ON l."messagesId" = m.id
  LEFT JOIN "ziteUsers" u ON u.id = m."sender"->>0 LEFT JOIN "Bots" bt ON bt.id::text = m."botId"`;
const shape = (r: Record<string, unknown>) => ({
  id: String(r.id), channelId: r.channelId ? String(r.channelId) : undefined, content: String(r.body ?? ''),
  author: r.botId ? { id: String(r.botId), name: String(r.botName ?? 'Bot'), bot: true } : { id: String(r.authorId ?? ''), name: String(r.authorName ?? 'Unknown'), bot: false },
  createdAt: new Date(String(r.createdAt)).toISOString(), editedAt: r.editedAt ? new Date(String(r.editedAt)).toISOString() : null,
  threadId: r.parentMessageId || null, replyToId: r.replyToId || null, pinned: !!r.pinned,
  embeds: parseEmbeds(r.embeds), components: parseComponents(r.components),
  attachments: (Array.isArray(r.attachments) ? r.attachments as Record<string, unknown>[] : []).map((a) => ({ url: String(a.url ?? ''), filename: String(a.originalName ?? a.filename ?? ''), contentType: String(a.mimeType ?? '') })),
});

const embedsIn = (v: unknown) => { const e = parseEmbeds(v); if (JSON.stringify(e).length > 12000) throw new ApiError('invalid_params', 'Embeds are too large (max 12 KB).'); return e; };
const componentsIn = (v: unknown) => parseComponents(v);

async function memberName(userId: string) {
  const r = await zite.auth.findAllUsers({ filters: { id: userId }, limit: 1 }).catch(() => null);
  const u = r?.records[0];
  return u ? (u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email.split('@')[0]) : 'Unknown';
}

type Handler = (b: Bot, p: Record<string, unknown>) => Promise<unknown>;
const ops: Record<string, Handler> = {
  ping: async () => ({ pong: true, time: new Date().toISOString() }),

  'bot.me': async (b) => ({ id: b.id, name: b.name, avatar: b.avatar ?? null, description: b.description ?? '', communityId: b.communityId, kind: b.kind ?? 'Custom', permissions: b.permissions ?? [], eventTypes: b.eventTypes ?? [], eventsUrl: b.eventsUrl ?? null, apiCalls: b.apiCalls ?? 0 }),

  'community.get': async (b) => {
    const { c, s, members } = await loadCommunity(b.communityId!);
    return { id: c.id, name: c.name, description: c.description ?? '', emoji: c.emoji ?? '', icon: s.icon, banner: s.banner, accent: s.accent, tagline: s.tagline, memberCount: members.length, isPublic: !!c.isPublic, verified: c.verificationStatus === 'Verified', roles: s.roles.map((r) => ({ id: r.id, name: r.name, color: r.color, permissions: r.perms })), rules: s.rules };
  },

  'channels.list': async (b) => {
    const r = await zite.sql({ query: `SELECT id, "name", "emoji", "settings", "lastMessageAt" FROM "Conversations" WHERE "communityId" = $1 ORDER BY created_at`, params: [b.communityId] });
    return { channels: r.rows.map((c) => { const ch = parseChannel(c.settings); return { id: String(c.id), name: String(c.name ?? ''), emoji: String(c.emoji ?? ''), topic: ch.topic, category: ch.category, announcement: ch.announcement, slowmode: ch.slowmode, private: ch.allowedRoles.length > 0, lastMessageAt: c.lastMessageAt ? new Date(String(c.lastMessageAt)).toISOString() : null }; }) };
  },
  'channels.get': async (b, p) => { const c = await channelOf(b, p.channelId); const ch = parseChannel(c.settings); return { id: c.id, name: c.name, emoji: c.emoji ?? '', topic: ch.topic, announcement: ch.announcement, slowmode: ch.slowmode, memberCount: ids(c.members).length }; },

  'members.list': async (b, p) => {
    need(b, 'View Members');
    const { s, members, ownerId } = await loadCommunity(b.communityId!);
    const limit = num(p.limit, 100, 1, 1000), offset = num(p.offset, 0, 0, 1e6);
    const page = members.slice(offset, offset + limit);
    const r = page.length ? await zite.sql({ query: `SELECT id, "name", "image" FROM "ziteUsers" WHERE id = ANY($1::text[])`, params: [page] }) : { rows: [] };
    const names = new Map<string, Record<string, unknown>>(r.rows.map((u) => [String(u.id), u as Record<string, unknown>] as [string, Record<string, unknown>]));
    return { total: members.length, members: page.map((id) => ({ id, name: String(names.get(id)?.name ?? 'Member'), avatar: names.get(id)?.image ?? null, nickname: s.nicknames[id] ?? null, roles: s.memberRoles[id] ?? [], owner: id === ownerId, timedOutUntil: s.timeouts[id] && new Date(s.timeouts[id]) > new Date() ? s.timeouts[id] : null })) };
  },
  'members.get': async (b, p) => {
    need(b, 'View Members');
    const id = str(p.userId, 'userId', 64);
    const { s, members, ownerId } = await loadCommunity(b.communityId!);
    if (!members.includes(id)) throw new ApiError('not_found', 'That user isn’t a member of this community.', 404);
    return { id, name: await memberName(id), nickname: s.nicknames[id] ?? null, roles: s.memberRoles[id] ?? [], owner: id === ownerId, warnings: (s.warnings[id] ?? []).length, timedOutUntil: s.timeouts[id] ?? null };
  },

  'messages.list': async (b, p) => {
    need(b, 'Read Messages');
    const c = await channelOf(b, p.channelId);
    const limit = num(p.limit, 50, 1, 100);
    const r = await zite.sql({
      query: `SELECT * FROM (${MSG_SQL} WHERE l."conversationsId" = $1::uuid AND ($2::timestamptz IS NULL OR m.created_at < $2::timestamptz) AND ($3::timestamptz IS NULL OR m.created_at > $3::timestamptz)
              AND ($5::text IS NULL OR m."parentMessageId" = $5 OR m.id::text = $5) ORDER BY m.created_at DESC LIMIT $4) t ORDER BY t."createdAt" ASC`,
      params: [c.id, p.before ? String(p.before) : null, p.after ? String(p.after) : null, limit, p.threadId ? String(p.threadId) : null],
    });
    const messages = r.rows.map(shape);
    return { messages, hasMore: messages.length === limit, nextBefore: messages[0]?.createdAt ?? null };
  },
  'messages.get': async (b, p) => {
    need(b, 'Read Messages');
    const { m } = await messageOf(b, p.messageId);
    const r = await zite.sql({ query: `${MSG_SQL} WHERE m.id = $1::uuid LIMIT 1`, params: [m.id] });
    return shape(r.rows[0]);
  },
  'messages.search': async (b, p) => {
    need(b, 'Read Messages');
    const q = str(p.query, 'query', 100);
    const r = await zite.sql({ query: `${MSG_SQL} JOIN "Conversations" cv ON cv.id = l."conversationsId" WHERE cv."communityId" = $1 AND m."body" ILIKE '%' || $2 || '%' ORDER BY m.created_at DESC LIMIT $3`, params: [b.communityId, q, num(p.limit, 25, 1, 100)] });
    return { messages: r.rows.map(shape) };
  },
  'messages.send': async (b, p) => {
    need(b, 'Send Messages');
    const c = await channelOf(b, p.channelId);
    const embeds = embedsIn(p.embeds), components = componentsIn(p.components);
    const body = typeof p.content === 'string' ? p.content : typeof p.body === 'string' ? p.body : '';
    if (!body.trim() && !embeds.length) throw new ApiError('invalid_params', 'Send params.content and/or params.embeds.');
    if (body.length > 4000) throw new ApiError('invalid_params', 'params.content can be at most 4000 characters.');
    const m = await postAsBot(b, c.id, { body, embeds, components, replyToId: p.replyToId ? String(p.replyToId) : null, parentMessageId: p.threadId ? String(p.threadId) : null });
    await emitEvent(b.communityId, 'MESSAGE_CREATE', c.id, { messageId: m.id, botId: b.id, body, channelId: c.id });
    return { id: m.id, channelId: c.id, createdAt: new Date().toISOString() };
  },
  'messages.edit': async (b, p) => {
    const { m, channel } = await messageOf(b, p.messageId);
    if (m.botId !== b.id) throw new ApiError('forbidden', 'Bots can only edit their own messages.', 403);
    const rec: Record<string, unknown> = { editedAt: new Date().toISOString() };
    if (typeof p.content === 'string') rec.body = p.content.slice(0, 4000);
    if (p.embeds !== undefined) rec.embeds = JSON.stringify(embedsIn(p.embeds));
    if (p.components !== undefined) rec.components = JSON.stringify(componentsIn(p.components));
    await zite.messages.update({ id: m.id, record: rec as never });
    await emitEvent(b.communityId, 'MESSAGE_UPDATE', channel.id, { messageId: m.id, botId: b.id });
    return { id: m.id, edited: true };
  },
  'messages.delete': async (b, p) => {
    const { m, channel } = await messageOf(b, p.messageId);
    if (m.botId !== b.id) need(b, 'Manage Messages');
    await zite.messages.delete({ id: m.id });
    await emitEvent(b.communityId, 'MESSAGE_DELETE', channel.id, { messageId: m.id, botId: b.id });
    await audit({ summary: `Bot ${b.name} deleted a message`, category: 'Bot', action: 'api.messages.delete', actorType: 'Bot', actorLabel: b.name ?? 'Bot', targetType: 'Message', targetId: m.id, targetUser: ids(m.sender)[0] ?? null, communityId: b.communityId, details: { body: m.body?.slice(0, 500), reason: p.reason ?? null } });
    return { id: m.id, deleted: true };
  },
  'messages.pin': async (b, p) => {
    need(b, 'Manage Messages');
    const { m } = await messageOf(b, p.messageId);
    await zite.messages.update({ id: m.id, record: { isPinned: p.pinned !== false } });
    return { id: m.id, pinned: p.pinned !== false };
  },

  'reactions.add': async (b, p) => {
    need(b, 'Add Reactions');
    const { m, channel } = await messageOf(b, p.messageId);
    const emoji = str(p.emoji, 'emoji', 16);
    const key = `${m.id}:bot:${b.id}:${emoji}`;
    if (!(await zite.reactions.findOne({ filters: { key } }))) await zite.reactions.create({ record: { key, emoji, message: m.id, reactor: null, conversation: channel.id, botId: b.id } });
    return { messageId: m.id, emoji, reacted: true };
  },
  'reactions.remove': async (b, p) => {
    const { m } = await messageOf(b, p.messageId);
    const emoji = str(p.emoji, 'emoji', 16);
    const ex = await zite.reactions.findOne({ filters: { key: `${m.id}:bot:${b.id}:${emoji}` } });
    if (ex) await zite.reactions.delete({ id: ex.id });
    return { messageId: m.id, emoji, reacted: false };
  },
  'reactions.list': async (b, p) => {
    need(b, 'Read Messages');
    const { m } = await messageOf(b, p.messageId);
    const r = await zite.sql({ query: `SELECT r."emoji", COALESCE(r."reactor"->>0, 'bot:' || r."botId") AS "userId" FROM "Reactions" r JOIN "MessagesReactions" lm ON lm."reactionsId" = r.id WHERE lm."messagesId" = $1::uuid`, params: [m.id] });
    const g = new Map<string, string[]>();
    for (const x of r.rows) g.set(String(x.emoji), [...(g.get(String(x.emoji)) ?? []), String(x.userId)]);
    return { reactions: [...g].map(([emoji, users]) => ({ emoji, count: users.length, users })) };
  },

  'roles.list': async (b) => { const { s } = await loadCommunity(b.communityId!); return { roles: s.roles.map((r) => ({ id: r.id, name: r.name, color: r.color, permissions: r.perms, hoist: r.hoist })) }; },
  'roles.add': async (b, p) => setRole(b, p, true),
  'roles.remove': async (b, p) => setRole(b, p, false),

  'members.timeout': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    if (!ctx.members.includes(uid)) throw new ApiError('not_found', 'Not a member.', 404);
    if (uid === ctx.ownerId) throw new ApiError('forbidden', 'The owner can’t be timed out.', 403);
    const mins = num(p.minutes, 10, 1, 40320);
    const until = new Date(Date.now() + mins * 60_000).toISOString();
    await saveSettings(b.communityId!, withAudit({ ...ctx.s, timeouts: { ...ctx.s.timeouts, [uid]: until } }, `bot:${b.id}`, `${b.name} timed out a member for ${mins} min${p.reason ? ` — ${String(p.reason).slice(0, 200)}` : ''}`));
    await audit({ summary: `Bot ${b.name} timed out a member for ${mins} min`, category: 'Moderation', action: 'api.members.timeout', actorType: 'Bot', actorLabel: b.name ?? 'Bot', targetType: 'User', targetUser: uid, communityId: b.communityId, severity: 'Notice', details: { minutes: mins, reason: p.reason ?? null } });
    return { userId: uid, timedOutUntil: until };
  },
  'members.untimeout': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    const t = { ...ctx.s.timeouts }; delete t[uid];
    await saveSettings(b.communityId!, withAudit({ ...ctx.s, timeouts: t }, `bot:${b.id}`, `${b.name} removed a timeout`));
    return { userId: uid, timedOutUntil: null };
  },
  'members.warn': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const reason = str(p.reason, 'reason', 300);
    const ctx = await loadCommunity(b.communityId!);
    const w = [...(ctx.s.warnings[uid] ?? []), { at: new Date().toISOString(), by: `bot:${b.id}`, reason }];
    await saveSettings(b.communityId!, withAudit({ ...ctx.s, warnings: { ...ctx.s.warnings, [uid]: w } }, `bot:${b.id}`, `${b.name} warned a member — ${reason}`));
    return { userId: uid, warnings: w.length };
  },
  'members.kick': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    if (uid === ctx.ownerId) throw new ApiError('forbidden', 'The owner can’t be removed.', 403);
    await zite.communities.update({ id: ctx.c.id, record: { members: ctx.members.filter((m) => m !== uid) } });
    await saveSettings(ctx.c.id, withAudit(ctx.s, `bot:${b.id}`, `${b.name} removed a member${p.reason ? ` — ${String(p.reason).slice(0, 200)}` : ''}`));
    await syncChannels(ctx.c.id);
    await emitEvent(ctx.c.id, 'MEMBER_LEAVE', null, { userId: uid, reason: 'kicked', by: b.id });
    await audit({ summary: `Bot ${b.name} removed a member`, category: 'Moderation', action: 'api.members.kick', actorType: 'Bot', actorLabel: b.name ?? 'Bot', targetType: 'User', targetUser: uid, communityId: ctx.c.id, severity: 'Warning', details: { reason: p.reason ?? null } });
    return { userId: uid, removed: true };
  },

  'events.poll': async (b, p) => {
    const after = num(p.after, 0, 0, 1e12);
    const r = await zite.sql({ query: `SELECT id, "seq", "eventType", "payload", "channelId", created_at FROM "BotEvents" WHERE "botId" = $1 AND "seq" > $2 ORDER BY "seq" ASC LIMIT $3`, params: [b.id, after, num(p.limit, 50, 1, 100)] });
    const events = r.rows.map((e) => { let payload: unknown = null; try { payload = JSON.parse(String(e.payload)); } catch { /* keep null */ } return { id: String(e.id), seq: Number(e.seq), type: String(e.eventType), channelId: e.channelId ? String(e.channelId) : null, createdAt: new Date(String(e.created_at)).toISOString(), payload }; });
    return { events, cursor: events.length ? events[events.length - 1].seq : after };
  },

  'interactions.respond': async (b, p) => {
    const ev = await zite.botEvents.findOne({ id: str(p.interactionId, 'interactionId', 64) }).catch(() => undefined);
    if (!ev || ev.botId !== b.id || ev.eventType !== 'INTERACTION_CREATE') throw new ApiError('not_found', 'Interaction not found.', 404);
    const data = (JSON.parse(ev.payload ?? '{}') as { data?: { messageId?: string; channelId?: string } }).data ?? {};
    if (p.type === 'update' && data.messageId) return ops['messages.edit'](b, { ...p, messageId: data.messageId });
    return ops['messages.send'](b, { ...p, channelId: data.channelId, replyToId: data.messageId });
  },

  'giveaways.create': async (b, p) => {
    need(b, 'Send Messages');
    const c = await channelOf(b, p.channelId);
    const ms = parseDuration(String(p.duration ?? '')) ?? num(p.durationMinutes, 60, 1, 43200) * 60_000;
    const prize = str(p.prize, 'prize', 200);
    const winners = num(p.winners, 1, 1, 20);
    const endsAt = new Date(Date.now() + ms).toISOString();
    const g = await zite.giveaways.create({ record: { prize, communityId: b.communityId, channelId: c.id, messageId: null, botId: b.id, endsAt, winnerCount: winners, entrants: [], winners: [], host: null, status: 'Running' } });
    const m = await postAsBot(b, c.id, { embeds: [{ title: `🎁 ${prize}`, description: `Click **Enter** to join!\nEnds <t:${endsAt}>\nWinners: **${winners}**`, color: '#f59e0b', footer: 'Giveaway' }], components: [[{ type: 'button', id: `giveaway:${g.id}`, label: 'Enter', emoji: '🎉', style: 'primary' }]] });
    await zite.giveaways.update({ id: g.id, record: { messageId: m.id } });
    return { id: g.id, messageId: m.id, endsAt };
  },
  'giveaways.end': async (b, p) => {
    const g = await zite.giveaways.findOne({ id: str(p.giveawayId, 'giveawayId', 64) }).catch(() => undefined);
    if (!g || g.communityId !== b.communityId) throw new ApiError('not_found', 'Giveaway not found.', 404);
    await endGiveaway(g.id);
    const after = await zite.giveaways.findOne({ id: g.id });
    return { id: g.id, winners: ids(after?.winners) };
  },
  'reminders.create': async (b, p) => {
    need(b, 'Send Messages');
    const c = await channelOf(b, p.channelId);
    const ms = parseDuration(String(p.in ?? ''));
    if (!ms) throw new ApiError('invalid_params', 'params.in must be a duration like "10m", "2h" or "1d".');
    const uid = str(p.userId, 'userId', 64);
    const dueAt = new Date(Date.now() + ms).toISOString();
    const r = await zite.reminders.create({ record: { text: str(p.text, 'text', 500), dueAt, user: uid, channelId: c.id, botId: b.id, status: 'Pending' } });
    return { id: r.id, dueAt };
  },

  // ── Extended API ───────────────────────────────────────────
  'messages.unpin': async (b, p) => {
    need(b, 'Manage Messages');
    const { m } = await messageOf(b, p.messageId);
    await zite.messages.update({ id: m.id, record: { isPinned: false } });
    return { id: m.id, pinned: false };
  },
  'messages.pins': async (b, p) => {
    need(b, 'Read Messages');
    const c = await channelOf(b, p.channelId);
    const r = await zite.sql({ query: `${MSG_SQL} WHERE l."conversationsId" = $1::uuid AND COALESCE(m."isPinned", false) ORDER BY m.created_at DESC LIMIT 50`, params: [c.id] });
    return { messages: r.rows.map(shape) };
  },
  'messages.bulkDelete': async (b, p) => {
    need(b, 'Manage Messages');
    const list = Array.isArray(p.messageIds) ? p.messageIds.map(String).slice(0, 100) : [];
    if (!list.length) throw new ApiError('invalid_params', 'params.messageIds must be a non-empty array (max 100).');
    const deleted: string[] = [];
    for (const id of list) {
      const { m, channel } = await messageOf(b, id).catch(() => ({ m: null, channel: null }));
      if (!m || !channel) continue;
      await zite.messages.delete({ id: m.id });
      await emitEvent(b.communityId, 'MESSAGE_DELETE', channel.id, { messageId: m.id, botId: b.id, bulk: true });
      deleted.push(m.id);
    }
    await audit({ summary: `Bot ${b.name} bulk-deleted ${deleted.length} messages`, category: 'Bot', action: 'api.messages.bulkDelete', actorType: 'Bot', actorLabel: b.name ?? 'Bot', communityId: b.communityId, severity: 'Notice', details: { reason: p.reason ?? null, count: deleted.length } });
    return { deleted, count: deleted.length };
  },
  'messages.crosspost': async (b, p) => {
    need(b, 'Read Messages'); need(b, 'Send Messages');
    const { m } = await messageOf(b, p.messageId);
    const to = await channelOf(b, p.toChannelId);
    const author = m.botId ? 'a bot' : await memberName(ids(m.sender)[0] ?? '');
    const out = await postAsBot(b, to.id, { body: `> ${String(m.body ?? '').slice(0, 3500).replace(/\n/g, '\n> ')}\n— shared from ${author}`, embeds: parseEmbeds(m.embeds) });
    await emitEvent(b.communityId, 'MESSAGE_CREATE', to.id, { messageId: out.id, botId: b.id, channelId: to.id });
    return { id: out.id, channelId: to.id };
  },
  'channels.setTopic': async (b, p) => updateChannel(b, p, (ch) => ({ ...ch, topic: typeof p.topic === 'string' ? p.topic.slice(0, 300) : '' }), 'changed the topic of'),
  'channels.setSlowmode': async (b, p) => updateChannel(b, p, (ch) => ({ ...ch, slowmode: num(p.seconds, 0, 0, 21600) }), 'changed slow mode in'),
  'channels.rename': async (b, p) => {
    need(b, 'Manage Channels');
    const c = await channelOf(b, p.channelId);
    const name = str(p.name, 'name', 60).toLowerCase().replace(/\s+/g, '-');
    await zite.conversations.update({ id: c.id, record: { name } as never });
    const ctx = await loadCommunity(b.communityId!);
    await saveSettings(ctx.c.id, withAudit(ctx.s, `bot:${b.id}`, `${b.name} renamed #${c.name} to #${name}`));
    return { id: c.id, name };
  },
  'roles.create': async (b, p) => {
    need(b, 'Manage Roles');
    const ctx = await loadCommunity(b.communityId!);
    if (ctx.s.roles.length >= 50) throw new ApiError('limit', 'A community can have up to 50 roles.');
    const role = { id: Math.random().toString(36).slice(2, 10), name: str(p.name, 'name', 40), color: /^#[0-9a-f]{6}$/i.test(String(p.color)) ? String(p.color) : '#94a3b8', perms: [], hoist: p.hoist === true };
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, roles: [...ctx.s.roles, role] }, `bot:${b.id}`, `${b.name} created role ${role.name}`));
    return { role: { id: role.id, name: role.name, color: role.color, permissions: [], hoist: role.hoist } };
  },
  'roles.update': async (b, p) => {
    need(b, 'Manage Roles');
    const rid = str(p.roleId, 'roleId', 64);
    const ctx = await loadCommunity(b.communityId!);
    const r = ctx.s.roles.find((x) => x.id === rid);
    if (!r) throw new ApiError('not_found', 'Role not found.', 404);
    const next = { ...r, ...(typeof p.name === 'string' && p.name.trim() ? { name: p.name.trim().slice(0, 40) } : {}), ...(/^#[0-9a-f]{6}$/i.test(String(p.color)) ? { color: String(p.color) } : {}), ...(typeof p.hoist === 'boolean' ? { hoist: p.hoist } : {}) };
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, roles: ctx.s.roles.map((x) => (x.id === rid ? next : x)) }, `bot:${b.id}`, `${b.name} updated role ${next.name}`));
    return { role: { id: next.id, name: next.name, color: next.color, permissions: next.perms, hoist: next.hoist } };
  },
  'roles.delete': async (b, p) => {
    need(b, 'Manage Roles');
    const rid = str(p.roleId, 'roleId', 64);
    const ctx = await loadCommunity(b.communityId!);
    const r = ctx.s.roles.find((x) => x.id === rid);
    if (!r) throw new ApiError('not_found', 'Role not found.', 404);
    if (r.perms.length) throw new ApiError('forbidden', 'Bots can only delete roles that grant no permissions.', 403);
    const mr = Object.fromEntries(Object.entries(ctx.s.memberRoles).map(([u, rs]) => [u, rs.filter((x) => x !== rid)]));
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, roles: ctx.s.roles.filter((x) => x.id !== rid), memberRoles: mr }, `bot:${b.id}`, `${b.name} deleted role ${r.name}`));
    await syncChannels(ctx.c.id);
    return { roleId: rid, deleted: true };
  },
  'roles.members': async (b, p) => {
    need(b, 'View Members');
    const rid = str(p.roleId, 'roleId', 64);
    const { s, members } = await loadCommunity(b.communityId!);
    const userIds = members.filter((u) => (s.memberRoles[u] ?? []).includes(rid));
    return { roleId: rid, members: await Promise.all(userIds.slice(0, 200).map(async (id) => ({ id, name: s.nicknames[id] || (await memberName(id)) }))) };
  },
  'members.ban': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    if (uid === ctx.ownerId) throw new ApiError('forbidden', 'The owner can’t be banned.', 403);
    await zite.communities.update({ id: ctx.c.id, record: { members: ctx.members.filter((m) => m !== uid) } });
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, banned: [...new Set([...ctx.s.banned, uid])] }, `bot:${b.id}`, `${b.name} banned a member${p.reason ? ` — ${String(p.reason).slice(0, 200)}` : ''}`));
    await syncChannels(ctx.c.id);
    await emitEvent(ctx.c.id, 'MEMBER_LEAVE', null, { userId: uid, reason: 'banned', by: b.id });
    await audit({ summary: `Bot ${b.name} banned a member`, category: 'Moderation', action: 'api.members.ban', actorType: 'Bot', actorLabel: b.name ?? 'Bot', targetType: 'User', targetUser: uid, communityId: ctx.c.id, severity: 'Warning', details: { reason: p.reason ?? null } });
    return { userId: uid, banned: true };
  },
  'members.unban': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, banned: ctx.s.banned.filter((x) => x !== uid) }, `bot:${b.id}`, `${b.name} unbanned a member`));
    return { userId: uid, banned: false };
  },
  'members.setNickname': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    if (!ctx.members.includes(uid)) throw new ApiError('not_found', 'Not a member.', 404);
    const nick = typeof p.nickname === 'string' ? p.nickname.trim().slice(0, 32) : '';
    const n = { ...ctx.s.nicknames }; if (nick) n[uid] = nick; else delete n[uid];
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, nicknames: n }, `bot:${b.id}`, `${b.name} ${nick ? 'set' : 'cleared'} a nickname`));
    return { userId: uid, nickname: nick || null };
  },
  'members.warnings': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const { s } = await loadCommunity(b.communityId!);
    return { userId: uid, warnings: s.warnings[uid] ?? [] };
  },
  'members.clearWarnings': async (b, p) => {
    need(b, 'Moderate Members');
    const uid = str(p.userId, 'userId', 64);
    const ctx = await loadCommunity(b.communityId!);
    const w = { ...ctx.s.warnings }; delete w[uid];
    await saveSettings(ctx.c.id, withAudit({ ...ctx.s, warnings: w }, `bot:${b.id}`, `${b.name} cleared a member's warnings`));
    return { userId: uid, warnings: 0 };
  },
  'storage.get': async (b, p) => { const kv = kvOf(b); const k = str(p.key, 'key', 64); return { key: k, value: kv[k] ?? null }; },
  'storage.set': async (b, p) => {
    const kv = kvOf(b); const k = str(p.key, 'key', 64);
    const v = JSON.stringify(p.value ?? null);
    if (v.length > 4000) throw new ApiError('invalid_params', 'Values can be at most 4 KB of JSON.');
    if (!(k in kv) && Object.keys(kv).length >= 200) throw new ApiError('limit', 'Bot storage holds up to 200 keys per community.');
    await saveKv(b, { ...kv, [k]: p.value ?? null });
    return { key: k, saved: true };
  },
  'storage.delete': async (b, p) => { const kv = { ...kvOf(b) }; const k = str(p.key, 'key', 64); const existed = k in kv; delete kv[k]; await saveKv(b, kv); return { key: k, deleted: existed }; },
  'storage.list': async (b, p) => { const pre = typeof p.prefix === 'string' ? p.prefix : ''; return { keys: Object.keys(kvOf(b)).filter((k) => k.startsWith(pre)).sort() }; },
};

/** Ops a developer key can call without picking a server: they span every server the bot is in. */
type Listing = NonNullable<Awaited<ReturnType<typeof listingFromKey>>>;
const appOps: Record<string, (l: Listing, installs: Bot[], p?: Record<string, unknown>) => Promise<unknown>> = {
  ping: async () => ({ pong: true, time: new Date().toISOString() }),
  'app.me': async (l, installs) => ({ id: l.id, name: l.name, avatar: l.avatar ?? null, status: l.status, servers: installs.length, apiCalls: installs.reduce((s, b) => s + Number(b.apiCalls ?? 0), 0) }),
  'bot.me': async (l, installs) => appOps['app.me'](l, installs),
  'servers.list': async (_l, installs) => {
    if (!installs.length) return { servers: [] };
    const r = await zite.sql({ query: `SELECT id::text AS id, "name", "emoji" FROM "Communities" WHERE id::text = ANY($1)`, params: [installs.map((b) => b.communityId)] });
    const nm = new Map(r.rows.map((c) => [String(c.id), c]));
    return { servers: installs.map((b) => ({ id: String(b.communityId), name: String(nm.get(String(b.communityId))?.name ?? 'Server'), emoji: String(nm.get(String(b.communityId))?.emoji ?? ''), enabled: b.enabled !== false, installedAt: (b as { createdAt?: string }).createdAt ?? null })) };
  },
  'events.poll': async (_l, installs, p = {}) => {
    const after = num(p.after, 0, 0, 1e12);
    if (!installs.length) return { events: [], cursor: after };
    const r = await zite.sql({ query: `SELECT id, "seq", "eventType", "payload", "channelId", "communityId", created_at FROM "BotEvents" WHERE "botId" = ANY($1) AND "seq" > $2 ORDER BY "seq" ASC LIMIT $3`, params: [installs.map((b) => b.id), after, num(p.limit, 50, 1, 100)] });
    const events = r.rows.map((e) => { let payload: unknown = null; try { payload = JSON.parse(String(e.payload)); } catch { /* keep null */ } return { id: String(e.id), seq: Number(e.seq), type: String(e.eventType), serverId: e.communityId ? String(e.communityId) : null, channelId: e.channelId ? String(e.channelId) : null, createdAt: new Date(String(e.created_at)).toISOString(), payload }; });
    return { events, cursor: events.length ? events[events.length - 1].seq : after };
  },
};

/** Per-install key/value storage, kept beside the bot's config so it survives restarts and version updates. */
const kvOf = (b: Bot): Record<string, unknown> => { try { return (JSON.parse(b.config || '{}').kv ?? {}) as Record<string, unknown>; } catch { return {}; } };
async function saveKv(b: Bot, kv: Record<string, unknown>) {
  let cfg: Record<string, unknown> = {}; try { cfg = JSON.parse(b.config || '{}'); } catch { /* reset */ }
  b.config = JSON.stringify({ ...cfg, kv });
  await zite.bots.update({ id: b.id, record: { config: b.config } });
}
async function updateChannel(b: Bot, p: Record<string, unknown>, fn: (ch: ReturnType<typeof parseChannel>) => ReturnType<typeof parseChannel>, verb: string) {
  need(b, 'Manage Channels');
  const c = await channelOf(b, p.channelId);
  const next = fn(parseChannel(c.settings));
  await zite.conversations.update({ id: c.id, record: { settings: JSON.stringify(next) } as never });
  const ctx = await loadCommunity(b.communityId!);
  await saveSettings(ctx.c.id, withAudit(ctx.s, `bot:${b.id}`, `${b.name} ${verb} #${c.name}`));
  return { id: c.id, topic: next.topic, slowmode: next.slowmode };
}

async function setRole(b: Bot, p: Record<string, unknown>, add: boolean) {
  need(b, 'Manage Roles');
  const uid = str(p.userId, 'userId', 64), rid = str(p.roleId, 'roleId', 64);
  const ctx = await loadCommunity(b.communityId!);
  if (!ctx.s.roles.some((r) => r.id === rid)) throw new ApiError('not_found', 'Role not found.', 404);
  if (!ctx.members.includes(uid)) throw new ApiError('not_found', 'Not a member.', 404);
  const cur = new Set(ctx.s.memberRoles[uid] ?? []);
  if (add) cur.add(rid); else cur.delete(rid);
  await saveSettings(ctx.c.id, withAudit({ ...ctx.s, memberRoles: { ...ctx.s.memberRoles, [uid]: [...cur] } }, `bot:${b.id}`, `${b.name} ${add ? 'gave' : 'removed'} role ${ctx.s.roles.find((r) => r.id === rid)?.name}`));
  await syncChannels(ctx.c.id);
  return { userId: uid, roles: [...cur] };
}

export default createEndpoint({
  description: 'Public Bot API: bots call this with their secret token to post, read, react and moderate',
  webhook: {
    "paused": false
  },
  inputSchema: z.object({ token: z.string().optional(), op: z.string(), params: z.record(z.unknown()).optional() }),
  outputSchema: z.object({ ok: z.boolean(), op: z.string(), data: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string(), status: z.number() }).optional() }),
  execute: async ({ input }) => {
    const raw = input as unknown as { token?: string; op?: string; params?: Record<string, unknown>; __webhook?: { headers?: Record<string, string> } };
    const op = String(raw.op ?? '');
    try {
      const headers = raw.__webhook?.headers ?? {};
      const tok = String(raw.token ?? (raw.params as { token?: string } | undefined)?.token ?? headers['x-bot-token'] ?? headers['x-chatting-token'] ?? headers['x-api-key'] ?? '').replace(/^(Bot|Bearer)\s+/i, '').trim();
      if (!tok) throw new ApiError('unauthorized', 'No API key found. Send it as "token" in the JSON body, or in an x-bot-token header (the Authorization header is not passed through).', 401);
      const params = raw.params ?? {};
      let bot: Bot | null | undefined;
      if (tok.startsWith('cbk_')) {
        // Developer key: one key for the bot, valid in every server it's in.
        const l = await listingFromKey(tok);
        if (!l) throw new ApiError('unauthorized', 'Invalid API key. Copy it again from the Developer portal.', 401);
        if (l.status === 'Removed') throw new ApiError('bot_removed', 'This bot was removed by Chatting staff.', 403);
        const sid = String(params.serverId ?? params.communityId ?? headers['x-chatting-server'] ?? '').trim();
        const { records } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
        if (appOps[op] && (!sid || !ops[op])) { rateLimit(l.id); return { ok: true, op, data: await appOps[op](l, records, params) }; }
        bot = sid ? records.find((b) => b.communityId === sid) : records.length === 1 ? records[0] : undefined;
        if (!bot) throw sid
          ? new ApiError('not_installed', 'Your bot isn’t in that server. Call servers.list to see where it is.', 404)
          : new ApiError('server_required', records.length ? `Your bot is in ${records.length} servers — pass params.serverId. Call servers.list to see them.` : 'Your bot isn’t in any server yet. Add it from its marketplace page first.', 400);
      } else bot = await botFromToken(tok);
      if (!bot) throw new ApiError('unauthorized', tok.startsWith('cb_') ? 'This per-server key is no longer valid. Use your bot’s API key (cbk_…) from the Developer portal.' : 'Invalid API key. Copy it again from the Developer portal — keys start with cbk_.', 401);
      if (bot.enabled === false) throw new ApiError('bot_disabled', 'This bot has been disabled by the community.', 403);
      if (!bot.communityId) throw new ApiError('no_community', 'This bot isn’t installed in a community.', 403);
      const h = ops[op];
      if (!h) throw new ApiError('unknown_op', `Unknown op “${op}”. See /developers for the list.`, 404);
      rateLimit(bot.id);
      const data = await h(bot, params);
      zite.bots.update({ id: bot.id, record: { apiCalls: Number(bot.apiCalls ?? 0) + 1, lastActiveAt: new Date().toISOString() } }).catch(() => {});
      return { ok: true, op, data };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, op, error: { code: e.code, message: e.message, status: e.status } };
      console.error('botApi', op, e);
      return { ok: false, op, error: { code: 'internal_error', message: 'Something went wrong handling that request.', status: 500 } };
    }
  },
});
