import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Download, Search } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { modInsights, type ModInsightsOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { PageHeader, Pill, Segmented, Stat, ago, input as inputCls } from '../kit';

type D = ModInsightsOutputType;
type Row = D['oldestOpen'][number];
const RANGES = ['7', '30', '90'] as const;

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border p-4 ${className}`}><p className="mb-3 text-sm font-semibold">{title}</p>{children}</div>;
}
function Bars({ rows, empty = 'No data yet' }: { rows: { k: string; n: number }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <div className="space-y-1.5">{rows.map((r) => <div key={r.k} className="flex items-center gap-2 text-xs"><span className="w-28 truncate" title={r.k}>{r.k}</span><div className="h-2 flex-1 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} /></div><span className="w-8 text-right font-mono">{r.n}</span></div>)}</div>;
}
function Tickets({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <div className="divide-y divide-border">{rows.map((t) => <a key={t.id} href={`/support/tickets?t=${t.id}`} className="flex items-center gap-2 py-2 text-sm hover:bg-secondary/40"><span className="min-w-0 flex-1 truncate">{t.subject || '(no subject)'}<span className="ml-2 text-xs text-muted-foreground">{t.email}</span></span>{t.rating != null && <span className="text-xs">{t.rating}★</span>}<Pill v={t.status} /><span className="w-24 text-right text-xs text-muted-foreground">{ago(t.createdAt)}</span></a>)}</div>;
}
const csv = (rows: Row[]) => {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'subject', 'email', 'status', 'priority', 'category', 'rating', 'createdAt', 'lastActivityAt'];
  const blob = new Blob([[head.join(','), ...rows.map((r) => head.map((h) => esc(r[h as keyof Row])).join(','))].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
};

export default function Insights() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('30');
  const [search, setSearch] = useState('');
  const [d, setD] = useState<D | null>(null);
  const load = useDebouncedCallback((s: string, r: string) => modInsights({ search: s, days: Number(r) }).then(setD).catch(() => {}), 300);
  useEffect(() => { load(search, range); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = d?.kpis;
  const hours = Array.from({ length: 24 }, (_, h) => ({ h: String(h).padStart(2, '0'), n: d?.busiestHours.find((x) => x.k === String(h).padStart(2, '0'))?.n ?? 0 }));
  const csat = [1, 2, 3, 4, 5].map((s) => ({ s: `${s}★`, n: d?.csat.find((x) => x.k === String(s))?.n ?? 0 }));

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Insights" desc="How the support team and platform are doing.">
        <div className="flex items-center gap-2"><Segmented value={range} options={RANGES} onChange={setRange} /><span className="text-xs text-muted-foreground">days</span>
          <button onClick={() => d && csv(d.exportRows)} disabled={!d} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><Download className="h-4 w-4" />Export CSV</button></div>
      </PageHeader>
      {!d || !k ? <Skeleton className="h-96" /> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Avg first response" value={k.firstResponseMins != null ? `${k.firstResponseMins} min` : '—'} />
          <Stat label="Avg resolution" value={k.resolutionHours != null ? `${k.resolutionHours} h` : '—'} />
          <Stat label="Unassigned open" value={k.unassignedOpen} tone={k.unassignedOpen ? 'warn' : undefined} />
          <Stat label="SLA breaches (24h no reply)" value={k.slaBreaches} tone={k.slaBreaches ? 'warn' : undefined} />
          <Stat label="Back-and-forth rate" value={k.reopenRate != null ? `${k.reopenRate}%` : '—'} hint="tickets with 2+ customer replies" />
          <Stat label="Repeat contacts" value={k.repeatContacts} hint="3+ tickets in range" />
          <Stat label="Avg backlog age" value={k.backlogAgeHours != null ? `${k.backlogAgeHours} h` : '—'} />
          <Stat label="Escalated open" value={k.escalated} tone={k.escalated ? 'warn' : undefined} />
        </div>
        <Card title="System health">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Overdue scheduled messages', d.health.overdueScheduled], ['Failed bot deliveries (24h)', d.health.failedBotDeliveries24h], ['Bots awaiting verification', d.health.pendingBotReviews], ['Open user reports', d.health.openReports]].map(([l, v]) => <div key={String(l)} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${Number(v) ? 'bg-amber-500' : 'bg-emerald-500'}`} /><span className="flex-1">{l}</span><b>{v}</b></div>)}</div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Tickets opened vs closed (14 days)"><div className="h-56"><ResponsiveContainer><LineChart data={d.ticketsByDay}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} fontSize={11} /><YAxis allowDecimals={false} fontSize={11} width={28} /><Tooltip /><Legend /><Line dataKey="opened" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} /><Line dataKey="closed" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Card>
          <Card title="When tickets come in (hour of day)"><div className="h-56"><ResponsiveContainer><BarChart data={hours}><XAxis dataKey="h" fontSize={10} interval={2} /><YAxis allowDecimals={false} fontSize={11} width={28} /><Tooltip /><Bar dataKey="n" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card title="Satisfaction breakdown"><div className="h-48"><ResponsiveContainer><BarChart data={csat}><XAxis dataKey="s" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} width={28} /><Tooltip /><Bar dataKey="n" fill="hsl(45 95% 55%)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card title="Agent leaderboard (public replies)"><Bars rows={d.agents} empty="No staff replies yet" /></Card>
          <Card title="Tickets by category"><Bars rows={d.byCategory} /></Card>
          <Card title="Open tickets by priority"><Bars rows={d.openByPriority} empty="Inbox zero 🎉" /></Card>
          <Card title="Top tags"><Bars rows={d.tags} /></Card>
          <Card title="Report reasons"><Bars rows={d.reportReasons} /></Card>
          <Card title="Top requesters"><Bars rows={d.topRequesters} /></Card>
          <Card title="Busiest communities (7 days)"><Bars rows={d.topCommunities} /></Card>
        </div>
        <Card title="Oldest open tickets"><Tickets rows={d.oldestOpen} empty="No open tickets." /></Card>
        <Card title="Low ratings to follow up (1–2★)"><Tickets rows={d.lowRatings} empty="No low ratings — nice." /></Card>
        <Card title="Ticket search">
          <label className="relative mb-3 block"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value, range); }} placeholder="Search by email, subject or description" className={`${inputCls} w-full pl-8`} /></label>
          {search.trim() && <Tickets rows={d.search} empty="No tickets match." />}
        </Card>
      </>}
    </div>
  );
}
