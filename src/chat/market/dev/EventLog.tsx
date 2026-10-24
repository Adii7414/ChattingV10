import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { devPortal, type DevPortalOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Switch } from '@project/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@project/components/ui/sheet';
import { BOT_EVENTS } from '../../../lib/bots';
import { Code, PageHead, ago, type Listing } from './kit';

type Ev = DevPortalOutputType['events'][number];
const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };

export default function EventLog({ l }: { l: Listing }) {
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [type, setType] = useState(''); const [status, setStatus] = useState(''); const [live, setLive] = useState(true);
  const [open, setOpen] = useState<Ev | null>(null); const [q, setQ] = useState('');
  const load = useCallback(() => devPortal({ action: 'events', listingId: l.id, type, status }).then((r) => setRows(r.events)).catch(() => setRows([])), [l.id, type, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!live) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [live, load]);
  const list = (rows ?? []).filter((e) => !q || e.payload.toLowerCase().includes(q.toLowerCase()) || e.serverName.toLowerCase().includes(q.toLowerCase()));
  const tone = (s: string) => s === 'Delivered' ? 'bg-primary/15 text-primary' : s === 'Failed' ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground';
  return (
    <>
      <PageHead title="Event Log" desc="The last 100 events sent to your bot, from every server.">
        <label className="flex items-center gap-2 text-sm"><Switch checked={live} onCheckedChange={setLive} />Live</label>
        <button onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </PageHead>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payloads" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm"><option value="">All events</option>{BOT_EVENTS.map((e) => <option key={e}>{e}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm"><option value="">Any status</option><option>Delivered</option><option>Failed</option><option>Polling only</option></select>
      </div>
      {!rows ? <Skeleton className="h-40 rounded-2xl" /> : !list.length ? <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No events yet. They appear here as soon as something happens in a server your bot is in.</p> : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border font-mono text-xs">{list.map((e) => (
          <button key={e.id} onClick={() => setOpen(e)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-secondary/50">
            <span className="w-14 shrink-0 text-muted-foreground">#{e.seq}</span><span className="w-40 shrink-0 truncate">{e.type}</span><span className="hidden min-w-0 flex-1 truncate font-sans text-muted-foreground sm:block">{e.serverName}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 font-sans text-[10px] ${tone(e.status)}`}>{e.status}{e.code ? ` ${e.code}` : ''}</span><span className="w-16 shrink-0 text-right font-sans text-muted-foreground">{ago(e.createdAt)}</span>
          </button>
        ))}</div>
      )}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle className="font-mono">{open?.type} #{open?.seq}</SheetTitle></SheetHeader>
        {open && <div className="mt-4 space-y-3 text-sm"><p><span className="text-muted-foreground">Server:</span> {open.serverName}</p><p><span className="text-muted-foreground">When:</span> {new Date(open.createdAt).toLocaleString()}</p><p><span className="text-muted-foreground">Delivery:</span> {open.status}{open.code ? ` (HTTP ${open.code})` : ''}{open.error ? ` — ${open.error}` : ''}</p><Code code={pretty(open.payload)} /></div>}
      </SheetContent></Sheet>
    </>
  );
}
