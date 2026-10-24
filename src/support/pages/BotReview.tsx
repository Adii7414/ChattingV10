import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { modMarketplace, type ModMarketplaceInputType, type ModMarketplaceOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Textarea } from '@project/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { PageHeader, Pill, Segmented, Stat, Empty, ago, input as inputCls } from '../kit';
import { errorMessage } from '../../lib/errors';
import { BotAvatar, BotBadge } from '../../chat/BotMessage';

type Item = ModMarketplaceOutputType['items'][number];
type Act = NonNullable<ModMarketplaceInputType['action']>;
const FILTERS = ['Pending', 'Verified', 'Featured', 'Removed', 'All'] as const;
const NEEDS_NOTE: Act[] = ['reject', 'remove', 'revoke'];

export default function BotReview() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Pending');
  const [q, setQ] = useState('');
  const [d, setD] = useState<ModMarketplaceOutputType | null>(null);
  const [sel, setSel] = useState<Item | null>(null);
  const [pending, setPending] = useState<Act | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => modMarketplace({ filter, q }).then(setD).catch((e) => toast.error(errorMessage(e, 'Couldn’t load'))), [filter, q]);
  useEffect(() => { load(); }, [load]);

  const run = async (action: Act, item: Item, n?: string) => {
    try { const r = await modMarketplace({ filter, q, action, listingId: item.id, note: n }); setD(r); setSel(r.items.find((x) => x.id === item.id) ?? null); setPending(null); setNote(''); toast.success('Done'); }
    catch (e) { toast.error(errorMessage(e, 'Action failed')); }
  };
  const ask = (a: Act) => (NEEDS_NOTE.includes(a) || a === 'approve' ? setPending(a) : sel && run(a, sel));

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Bot marketplace" desc="Review verification applications, feature great bots and remove harmful ones." />
      {d && <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Awaiting review" value={d.stats.pending} tone={d.stats.pending ? 'warn' : undefined} /><Stat label="Verified" value={d.stats.verified} /><Stat label="Published" value={d.stats.published} /><Stat label="Total installs" value={d.stats.installs} /><Stat label="Removed" value={d.stats.removed} /></div>}
      <div className="mb-4 flex flex-wrap items-center gap-3"><Segmented value={filter} options={FILTERS} onChange={setFilter} /><label className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bot or developer email" className={`${inputCls} pl-8`} /></label></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-2">
          {!d ? <Skeleton className="h-40" /> : d.items.length === 0 ? <Empty>Nothing here.</Empty> : d.items.map((i) => (
            <button key={i.id} onClick={() => setSel(i)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${sel?.id === i.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <BotAvatar name={i.name} avatar={i.avatar} size={36} />
              <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 text-sm font-medium">{i.name}<BotBadge verified={i.verificationStatus === 'Verified'} />{i.featured && <Sparkles className="h-3 w-3 text-amber-500" />}</p><p className="truncate text-xs text-muted-foreground">{i.ownerEmail} · {i.installs} installs{i.appliedAt ? ` · applied ${ago(i.appliedAt)}` : ''}</p></div>
              <Pill v={i.status === 'Removed' ? 'Removed' : i.verificationStatus} />
            </button>
          ))}
        </div>
        {sel && (
          <div className="h-fit space-y-4 rounded-2xl border border-border p-4 lg:sticky lg:top-4">
            <div className="flex items-start justify-between"><div className="flex items-center gap-3"><BotAvatar name={sel.name} avatar={sel.avatar} size={44} /><div><p className="font-semibold">{sel.name}</p><p className="text-xs text-muted-foreground">{sel.ownerName} · {sel.category}</p></div></div><button onClick={() => setSel(null)}><X className="h-4 w-4" /></button></div>
            <p className="text-sm text-muted-foreground">{sel.tagline}</p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">{[['Installs', sel.installs], ['Rating', sel.rating ?? '—'], ['Low reviews', sel.lowReviews], ['Failed events 7d', sel.failedDeliveries7d], ['Commands', sel.commands], ['Perms', sel.permissions.length]].map(([l, v]) => <div key={String(l)} className="rounded-lg bg-secondary p-2"><p className="text-base font-semibold">{v}</p><p className="text-muted-foreground">{l}</p></div>)}</div>
            {sel.permissions.some((p) => ['Manage Roles', 'Moderate Members', 'Manage Channels', 'Manage Messages'].includes(p)) && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">⚠️ Asks for powerful permissions: {sel.permissions.filter((p) => p.startsWith('Manage') || p.startsWith('Moderate')).join(', ')}</p>}
            {sel.application && <div className="space-y-2 rounded-xl border border-border p-3 text-sm"><p className="text-xs font-semibold uppercase text-muted-foreground">Application</p><p><b>Purpose:</b> {sel.application.purpose}</p><p><b>Data use:</b> {sel.application.dataUse}</p><p><b>Contact:</b> {sel.application.contact}</p></div>}
            <div className="flex flex-wrap gap-2 text-xs">{sel.eventsUrl && <span className="rounded bg-secondary px-2 py-1">Events URL set</span>}{sel.privacyUrl && <a href={sel.privacyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1">Privacy policy<ExternalLink className="h-3 w-3" /></a>}<a href={`/app/bots/${sel.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1">Open listing<ExternalLink className="h-3 w-3" /></a></div>
            {sel.verificationNote && <p className="text-xs text-muted-foreground">Last note: {sel.verificationNote}</p>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {sel.verificationStatus === 'Pending' && <><button onClick={() => ask('approve')} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"><Check className="h-3.5 w-3.5" />Verify</button><button onClick={() => ask('reject')} className="h-8 rounded-lg border border-border px-3 text-xs">Reject</button></>}
              {sel.verificationStatus === 'Verified' && <button onClick={() => ask('revoke')} className="h-8 rounded-lg border border-border px-3 text-xs">Revoke tick</button>}
              {sel.status !== 'Removed' && <button onClick={() => ask(sel.featured ? 'unfeature' : 'feature')} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs"><Sparkles className="h-3.5 w-3.5" />{sel.featured ? 'Unfeature' : 'Feature'}</button>}
              {sel.status === 'Removed' ? <button onClick={() => ask('restore')} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs"><Undo2 className="h-3.5 w-3.5" />Restore</button> : <button onClick={() => ask('remove')} className="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-3 text-xs text-destructive"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
            </div>
          </div>
        )}
      </div>
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}><DialogContent><DialogHeader><DialogTitle className="capitalize">{pending} {sel?.name}</DialogTitle></DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={pending && NEEDS_NOTE.includes(pending) ? 'Note to the developer (required)' : 'Optional note to the developer'} />
        <button disabled={!!pending && NEEDS_NOTE.includes(pending) && !note.trim()} onClick={() => sel && pending && run(pending, sel, note)} className="h-10 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">Confirm</button>
      </DialogContent></Dialog>
    </div>
  );
}
