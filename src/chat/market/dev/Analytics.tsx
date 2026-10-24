import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { devPortal, type DevPortalOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { PageHead, Panel, Stat, type Listing } from './kit';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--primary))'];

export default function Analytics({ l }: { l: Listing }) {
  const [d, setD] = useState<DevPortalOutputType | null>(null);
  useEffect(() => { devPortal({ action: 'stats', listingId: l.id }).then(setD).catch(() => {}); }, [l.id]);
  if (!d) return <><PageHead title="Analytics" /><Skeleton className="h-80 rounded-2xl" /></>;
  const t = d.totals;
  const sent = t.delivered + t.failed;
  const week = d.daily.slice(-7).reduce((s, x) => s + x.events, 0), prev = d.daily.slice(0, 7).reduce((s, x) => s + x.events, 0);
  const trend = prev ? Math.round(((week - prev) / prev) * 100) : null;
  return (
    <>
      <PageHead title="Analytics" desc="How your bot is used across every server, over the last 14 days." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Servers" value={l.installs} /><Stat label="API calls" value={t.calls} /><Stat label="Events" value={t.events} hint={trend == null ? undefined : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}% vs last week`} />
        <Stat label="Delivery success" value={sent ? `${Math.round((t.delivered / sent) * 100)}%` : '—'} hint={`${t.failed} failed`} /><Stat label="Rating" value={l.rating != null ? `${l.rating}★` : '—'} hint={`${l.ratingCount} reviews`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Events per day" className="lg:col-span-2">
          <div className="h-56"><ResponsiveContainer><BarChart data={d.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} fontSize={11} /><YAxis allowDecimals={false} fontSize={11} width={30} /><Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} /><Bar dataKey="events" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} /><Bar dataKey="failed" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Events by type">
          {!d.byType.length ? <p className="text-sm text-muted-foreground">No events yet.</p> : <div className="flex items-center gap-4"><div className="h-40 w-40"><ResponsiveContainer><PieChart><Pie data={d.byType} dataKey="n" nameKey="type" innerRadius={40} outerRadius={70}>{d.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
            <ul className="space-y-1 text-xs">{d.byType.map((x, i) => <li key={x.type} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="font-mono">{x.type}</span><span className="text-muted-foreground">{x.n}</span></li>)}</ul></div>}
        </Panel>
        <Panel title="Top servers by API calls">
          {!d.servers.length ? <p className="text-sm text-muted-foreground">No servers yet.</p> : <ul className="space-y-2">{d.servers.map((s) => { const max = Math.max(1, ...d.servers.map((x) => x.calls)); return <li key={s.name} className="text-sm"><div className="flex justify-between"><span className="truncate">{s.name}</span><span className="tabular-nums text-muted-foreground">{s.calls}</span></div><div className="mt-1 h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${(s.calls / max) * 100}%` }} /></div></li>; })}</ul>}
        </Panel>
      </div>
    </>
  );
}
