import { useMemo, useState } from 'react';
import { Loader2, Play, Trash2 } from 'lucide-react';
import { botApi } from 'zitejs/api';
import { Textarea } from '@project/components/ui/textarea';
import { OPS } from '../../../developers/reference';
import { useChat } from '../../store';
import { Code, PageHead, Panel, useLocal, type Listing } from './kit';

type Hist = { op: string; params: string; ok: boolean; ms: number; at: string };

export default function Console({ l }: { l: Listing }) {
  const { communities } = useChat();
  const [op, setOp] = useState('servers.list');
  const [params, setParams] = useState('{}');
  const [server, setServer] = useState('');
  const [res, setRes] = useState<{ body: string; ok: boolean; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useLocal<Hist[]>(`dev.console.${l.id}`, []);
  const def = OPS.find((o) => o.op === op);
  const opts = useMemo(() => ['servers.list', 'app.me', ...OPS.map((o) => o.op)], []);
  let parsed: Record<string, unknown> | null = null; try { parsed = JSON.parse(params || '{}'); } catch { parsed = null; }
  const pick = (o: string) => { setOp(o); const d = OPS.find((x) => x.op === o); setParams(JSON.stringify(d?.example ?? {}, null, 2)); };
  const run = async () => {
    if (!parsed || !l.apiKey) return;
    setBusy(true); const t0 = performance.now();
    const p = server ? { ...parsed, serverId: server } : parsed;
    try {
      const r = await botApi({ token: l.apiKey, op, params: p });
      const ms = Math.round(performance.now() - t0);
      setRes({ body: JSON.stringify(r, null, 2), ok: r.ok, ms });
      setHist((h) => [{ op, params, ok: r.ok, ms, at: new Date().toISOString() }, ...h].slice(0, 20));
    } catch (e) { setRes({ body: String(e), ok: false, ms: Math.round(performance.now() - t0) }); } finally { setBusy(false); }
  };
  const nameOf = (id: string) => communities.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  return (
    <>
      <PageHead title="API Console" desc="Make real Bot API calls as your bot, using its API key. Careful — actions really happen." />
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Panel>
            <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
              <input list="ops" value={op} onChange={(e) => pick(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-sm" />
              <datalist id="ops">{opts.map((o) => <option key={o} value={o} />)}</datalist>
              <input value={server} onChange={(e) => setServer(e.target.value.trim())} placeholder="serverId (optional)" className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-xs" />
            </div>
            {def && <p className="mt-2 text-xs text-muted-foreground">{def.summary}{def.perm ? ` · needs ${def.perm}` : ''}{def.params.length ? ` · params: ${def.params.map((p) => p.name + (p.required ? '*' : '')).join(', ')}` : ''}</p>}
            <Textarea rows={6} value={params} onChange={(e) => setParams(e.target.value)} className={`mt-3 font-mono text-xs ${parsed ? '' : 'border-destructive'}`} />
            <div className="mt-3 flex items-center gap-2"><button onClick={run} disabled={busy || !parsed} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Send</button>
              <button onClick={() => setParams(JSON.stringify(parsed ?? {}, null, 2))} disabled={!parsed} className="h-9 rounded-lg border border-border px-3 text-sm">Format</button>
              {!parsed && <span className="text-xs text-destructive">Invalid JSON</span>}</div>
          </Panel>
          {res && <Panel title={`Response · ${res.ms} ms`} right={<span className={`rounded px-2 py-0.5 text-xs ${res.ok ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>{res.ok ? 'OK' : 'Error'}</span>}><Code code={res.body} /></Panel>}
        </div>
        <div className="space-y-4">
          <Panel title="Servers"><div className="space-y-1">{communities.slice(0, 8).map((c) => <button key={c.id} onClick={() => setServer(c.id)} className={`block w-full truncate rounded-md px-2 py-1 text-left text-xs ${server === c.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}>{c.emoji ?? ''} {c.name}</button>)}<p className="pt-1 text-[11px] text-muted-foreground">Your bot must be in the server.</p></div></Panel>
          <Panel title="History" right={hist.length ? <button onClick={() => setHist([])} aria-label="Clear"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button> : undefined}>
            {!hist.length ? <p className="text-xs text-muted-foreground">Your calls appear here.</p> : <div className="space-y-1">{hist.map((h, i) => <button key={i} onClick={() => { setOp(h.op); setParams(h.params); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-secondary"><span className={`h-1.5 w-1.5 rounded-full ${h.ok ? 'bg-primary' : 'bg-destructive'}`} /><span className="flex-1 truncate font-mono">{h.op}</span><span className="text-muted-foreground">{h.ms}ms</span></button>)}</div>}
          </Panel>
          {server && <p className="text-[11px] text-muted-foreground">Target: {nameOf(server)}</p>}
        </div>
      </div>
    </>
  );
}
