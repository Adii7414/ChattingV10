import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, Flame, Loader2 } from 'lucide-react';
import { myStats, type MyStatsOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { useChat } from '../store';
import { errorMessage } from '../../lib/errors';
import { Box, FancyText, FocusTimer, InviteQR, Kaomoji, Shortcuts, Templates, WorldClock } from './Tools';

type S = MyStatsOutputType;

function Heatmap({ days }: { days: S['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  return <div className="grid grid-flow-col grid-rows-7 gap-1">{days.map((d) => <span key={d.day} title={`${d.day}: ${d.n} messages`} className="h-3 w-3 rounded-[3px]" style={{ background: d.n ? `hsl(var(--primary) / ${0.2 + (d.n / max) * 0.8})` : 'hsl(var(--secondary))' }} />)}</div>;
}

function Stats({ s }: { s: S }) {
  const { conversations, titleOf } = useChat();
  const peak = s.hours.reduce((a, b) => (b.n > a.n ? b : a), s.hours[0]);
  const maxH = Math.max(1, ...s.hours.map((h) => h.n));
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true);
    try {
      const r = await myStats({ export: true });
      const named = r.exported.map((m) => { const c = conversations?.find((x) => x.id === m.conversationId); return { ...m, chat: c ? titleOf(c) : 'Chat' }; });
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(named, null, 2)], { type: 'application/json' })); a.download = 'my-chatting-messages.json'; a.click();
      toast.success(`Exported ${named.length} messages`);
    } catch (e) { toast.error(errorMessage(e, 'Export failed')); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Box title="Your numbers" emoji="📊">
        <div className="grid grid-cols-2 gap-3 text-center">{[['Messages', s.total], ['This week', s.week], ['Today', s.today], ['Reactions', s.reactionsGiven], ['Avg length', `${s.avgLength} ch`], ['Best streak', `${s.longestStreak}d`]].map(([l, v]) => <div key={String(l)} className="rounded-2xl bg-secondary/60 p-3"><p className="text-xl font-semibold">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}</div>
        <button onClick={exportAll} disabled={busy} className="mt-3 inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Download my messages</button>
      </Box>
      <Box title="Streak" emoji="🔥">
        <p className="flex items-center gap-2 text-4xl font-semibold"><Flame className={`h-8 w-8 ${s.streak ? 'text-orange-500' : 'text-muted-foreground'}`} />{s.streak} <span className="text-base font-normal text-muted-foreground">day{s.streak === 1 ? '' : 's'}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">{s.streak ? 'Send a message every day to keep it going.' : 'Send a message today to start a streak.'}</p>
        <div className="mt-4 overflow-x-auto"><Heatmap days={s.days} /></div>
      </Box>
      <Box title="Your people" emoji="💛">
        {s.topChats.length === 0 ? <p className="text-sm text-muted-foreground">Start chatting to see who you talk to most.</p> : <div className="space-y-2">{s.topChats.map((t, i) => { const c = conversations?.find((x) => x.id === t.conversationId); return <Link key={t.conversationId} to={`/app/c/${t.conversationId}`} className="flex items-center gap-2 text-sm hover:underline"><span className="w-5 text-muted-foreground">{i + 1}.</span><span className="flex-1 truncate">{c ? titleOf(c) : 'A chat'}</span><span className="font-mono text-xs">{t.n}</span></Link>; })}</div>}
        {s.emojis.length > 0 && <><p className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Favourite reactions</p><div className="mt-1 flex flex-wrap gap-2 text-lg">{s.emojis.map((e) => <span key={e.emoji} title={`${e.n}×`}>{e.emoji}<sub className="text-[10px] text-muted-foreground">{e.n}</sub></span>)}</div></>}
      </Box>
      <div className="lg:col-span-3"><Box title={`When you chat · peak ${String(peak.h).padStart(2, '0')}:00`} emoji="🕒"><div className="flex h-24 items-end gap-1">{s.hours.map((h) => <div key={h.h} title={`${h.h}:00 — ${h.n}`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${Math.max(4, (h.n / maxH) * 100)}%` }} />)}</div><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></Box></div>
    </div>
  );
}

export default function Labs() {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => { myStats({}).then(setS).catch(() => {}); }, []);
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:px-8">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground md:hidden"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <div><h1 className="text-3xl font-semibold tracking-tight">Toolbox</h1><p className="mt-1 text-muted-foreground">Your stats, handy tools and little extras.</p></div>
        {s ? <Stats s={s} /> : <Skeleton className="h-64 rounded-3xl" />}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><FocusTimer /><WorldClock /><InviteQR /><Templates /><FancyText /><Kaomoji /><Shortcuts /></div>
      </div>
    </section>
  );
}
