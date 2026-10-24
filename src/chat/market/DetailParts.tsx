import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Terminal } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { Dialog, DialogContent } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { PERM_INFO, RISK_CLASS, RISK_LABEL, riskOf } from '../../lib/marketLocal';
import { BotCardTile, type Listing } from './BotCard';

export function Permissions({ perms }: { perms: string[] }) {
  const r = riskOf(perms);
  return (
    <div>
      <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissions<span className={cn('rounded-full px-2 py-0.5 text-[10px] normal-case', RISK_CLASS[r])}>{RISK_LABEL[r]}</span></p>
      <ul className="mt-2 space-y-2">{perms.map((p) => <li key={p} className="flex gap-2"><span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', ['bg-primary', 'bg-amber-400', 'bg-destructive'][PERM_INFO[p]?.risk ?? 0])} /><span><span className="font-medium">{p}</span><span className="block text-xs text-muted-foreground">{PERM_INFO[p]?.text}</span></span></li>)}{!perms.length && <li className="text-muted-foreground">None</li>}</ul>
    </div>
  );
}

export function Screenshots({ shots }: { shots: string[] }) {
  const [i, setI] = useState<number | null>(null);
  if (!shots.length) return null;
  return (
    <>
      <div className="mt-6 flex gap-3 overflow-x-auto pb-2">{shots.map((s, n) => <button key={s} onClick={() => setI(n)}><img src={s} alt="" className="h-48 shrink-0 rounded-2xl border border-border object-cover transition hover:opacity-90" /></button>)}</div>
      <Dialog open={i !== null} onOpenChange={(o) => !o && setI(null)}>
        <DialogContent className="max-w-4xl p-2">{i !== null && <><img src={shots[i]} alt="" className="max-h-[80vh] w-full rounded-xl object-contain" />
          {shots.length > 1 && <div className="flex justify-between p-2 text-sm"><button onClick={() => setI((i - 1 + shots.length) % shots.length)}>← Prev</button><span className="text-muted-foreground">{i + 1} / {shots.length}</span><button onClick={() => setI((i + 1) % shots.length)}>Next →</button></div>}</>}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Commands({ cmds }: { cmds: Listing['commands'] }) {
  const [f, setF] = useState('');
  if (!cmds.length) return null;
  const shown = cmds.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(f.toLowerCase()));
  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Commands <span className="text-sm font-normal text-muted-foreground">{cmds.length}</span></h2>
        {cmds.length > 5 && <input value={f} onChange={(e) => setF(e.target.value)} placeholder="Filter commands" className="h-8 w-40 rounded-full border border-border bg-background px-3 text-sm" />}</div>
      <div className="mt-3 divide-y divide-border rounded-2xl border border-border">{shown.map((c) => {
        const cmd = `/${c.name.replace(/^\//, '')}`;
        return <button key={c.name} onClick={() => { navigator.clipboard.writeText(cmd); toast.success(`Copied ${cmd}`); }} className="group flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-secondary/50"><Terminal className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="flex-1"><p className="font-mono font-medium">{cmd}</p><p className="text-muted-foreground">{c.description}</p></div><Copy className="h-4 w-4 opacity-0 transition group-hover:opacity-60" /></button>;
      })}</div>
    </>
  );
}

/** "More from this developer" and "Similar bots" rows. */
export function Related({ l }: { l: Listing }) {
  const [pool, setPool] = useState<Listing[]>([]);
  const navigate = useNavigate();
  useEffect(() => { marketplace({ action: 'browse', sort: 'popular' }).then((r) => setPool(r.listings)).catch(() => {}); }, [l.id]);
  const others = pool.filter((x) => x.id !== l.id);
  const rows = [[`More from ${l.ownerName}`, others.filter((x) => x.ownerId === l.ownerId)], ['Similar bots', others.filter((x) => x.category === l.category && x.ownerId !== l.ownerId)]] as const;
  return <>{rows.map(([t, items]) => items.length > 0 && (
    <div key={t} className="mt-10"><h2 className="text-lg font-semibold">{t}</h2>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">{items.slice(0, 8).map((x) => <div key={x.id} className="w-60 shrink-0"><BotCardTile l={x} onOpen={() => navigate(`/app/bots/${x.id}`)} /></div>)}</div></div>
  ))}</>;
}
